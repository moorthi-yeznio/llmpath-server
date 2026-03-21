/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DRIZZLE } from '../db/drizzle.constants.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTOR_ID = 'aaaaaaaa-0000-0000-0000-000000000000';
const TENANT_ID = 'bbbbbbbb-0000-0000-0000-000000000000';
const USER_ID = 'cccccccc-0000-0000-0000-000000000000';

const TENANT_ROW = {
  id: TENANT_ID,
  name: 'Acme School',
  slug: 'acme',
  created_at: new Date(),
};

// ---------------------------------------------------------------------------
// Chainable Drizzle mock
// ---------------------------------------------------------------------------

/**
 * Creates a thenable chain object that properly resolves to `result` when
 * awaited, and returns `this` from every chain method (from, where, etc.).
 *
 * The critical requirement: `then(onFulfilled, onRejected)` must actually
 * call onFulfilled/onRejected via the underlying Promise, otherwise `await`
 * hangs forever.
 */
function makeChainable(result: unknown) {
  const underlying =
    result instanceof Promise ? result : Promise.resolve(result);

  const chain: Record<string, unknown> = {
    then(
      onFulfilled: (v: unknown) => unknown,
      onRejected: (e: unknown) => unknown,
    ) {
      return underlying.then(onFulfilled, onRejected);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return underlying.catch(onRejected);
    },
    finally(onFinally: () => void) {
      return underlying.finally(onFinally);
    },
  };

  const chainMethods = [
    'from',
    'leftJoin',
    'innerJoin',
    'where',
    'limit',
    'values',
    'returning',
    'onConflictDoNothing',
    'set',
    'orderBy',
  ];
  for (const m of chainMethods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }

  return chain;
}

/** Marker class for enqueuing errors instead of values. */
class DbError {
  constructor(readonly error: Error) {}
}

type DbMethod = 'select' | 'insert' | 'update' | 'delete';

interface DbMock {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  transaction: jest.Mock;
  enqueue: (method: DbMethod, value: unknown) => void;
  enqueueError: (method: DbMethod, error: Error) => void;
}

/**
 * Builds a minimal Drizzle db mock.
 *
 * Each call to `db.select()` / `db.insert()` / `db.update()` / `db.delete()`
 * dequeues the next pre-registered result for that method.
 * `db.transaction(cb)` calls `cb(db)` so inner tx calls share the same queue.
 */
function buildDb(): DbMock {
  const queues: Record<DbMethod, unknown[]> = {
    select: [],
    insert: [],
    update: [],
    delete: [],
  };

  function dequeue(method: DbMethod): unknown {
    const q = queues[method];
    const item = q.length > 0 ? q.shift() : [];
    if (item instanceof DbError) {
      return Promise.reject(item.error);
    }
    return item;
  }

  const db: DbMock = {
    select: jest.fn(() => makeChainable(dequeue('select'))),
    insert: jest.fn(() => makeChainable(dequeue('insert'))),
    update: jest.fn(() => makeChainable(dequeue('update'))),
    delete: jest.fn(() => makeChainable(dequeue('delete'))),
    transaction: jest.fn((cb: (tx: DbMock) => Promise<unknown>) => cb(db)),
    enqueue(method: DbMethod, value: unknown) {
      queues[method].push(value);
    },
    enqueueError(method: DbMethod, error: Error) {
      queues[method].push(new DbError(error));
    },
  };

  return db;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('TenantsService', () => {
  let service: TenantsService;
  let db: ReturnType<typeof buildDb>;
  let supabase: jest.Mocked<SupabaseService>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    db = buildDb();

    supabase = {
      createUser: jest.fn(),
      getUserByEmail: jest.fn(),
      banUser: jest.fn().mockResolvedValue(undefined),
      unbanUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SupabaseService>;

    audit = {
      log: jest.fn(),
    } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: DRIZZLE, useValue: db },
        { provide: SupabaseService, useValue: supabase },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  // -------------------------------------------------------------------------
  // createTenant
  // -------------------------------------------------------------------------

  describe('createTenant', () => {
    it('returns the created tenant', async () => {
      db.enqueue('insert', [TENANT_ROW]);

      const result = await service.createTenant(
        'Acme School',
        'acme',
        ACTOR_ID,
      );

      expect(result.tenant.name).toBe('Acme School');
      expect(result.tenant.slug).toBe('acme');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'tenant' }),
      );
    });

    it('throws ConflictException on duplicate slug (pg unique violation)', async () => {
      const pgError = Object.assign(new Error('duplicate key'), {
        code: '23505',
      });
      db.enqueueError('insert', pgError);

      await expect(
        service.createTenant('Acme School', 'acme', ACTOR_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // assignTenantAdmin
  // -------------------------------------------------------------------------

  describe('assignTenantAdmin', () => {
    it('creates a Supabase user and inserts membership when user does not exist', async () => {
      // assertTenantExists → found
      db.enqueue('select', [{ id: TENANT_ID }]);
      supabase.getUserByEmail.mockResolvedValue(null);
      supabase.createUser.mockResolvedValue({
        id: USER_ID,
        email: 'admin@acme.com',
      });
      // tx: insert users (onConflictDoNothing)
      db.enqueue('insert', []);
      // tx: select existing membership → none
      db.enqueue('select', []);
      // tx: insert new membership
      db.enqueue('insert', []);

      const result = await service.assignTenantAdmin(
        TENANT_ID,
        'admin@acme.com',
        'password123',
        ACTOR_ID,
      );

      expect(supabase.createUser).toHaveBeenCalledWith(
        'admin@acme.com',
        'password123',
      );
      expect(result.role).toBe('tenant_admin');
      expect(result.email).toBe('admin@acme.com');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entityType: 'tenant_membership',
        }),
      );
    });

    it('reuses an existing Supabase user and upgrades membership role', async () => {
      db.enqueue('select', [{ id: TENANT_ID }]);
      supabase.getUserByEmail.mockResolvedValue({
        id: USER_ID,
        email: 'admin@acme.com',
      });
      // tx: insert users (noop)
      db.enqueue('insert', []);
      // tx: select existing membership → tutor (non-admin)
      db.enqueue('select', [{ id: 'membership-id', role: 'tutor' }]);
      // tx: update membership role
      db.enqueue('update', []);

      const result = await service.assignTenantAdmin(
        TENANT_ID,
        'admin@acme.com',
        'password123',
        ACTOR_ID,
      );

      expect(supabase.createUser).not.toHaveBeenCalled();
      expect(result.role).toBe('tenant_admin');
    });

    it('throws ConflictException when user is already a tenant_admin', async () => {
      db.enqueue('select', [{ id: TENANT_ID }]);
      supabase.getUserByEmail.mockResolvedValue({
        id: USER_ID,
        email: 'admin@acme.com',
      });
      db.enqueue('insert', []);
      // tx: existing membership is already tenant_admin
      db.enqueue('select', [{ id: 'membership-id', role: 'tenant_admin' }]);

      await expect(
        service.assignTenantAdmin(
          TENANT_ID,
          'admin@acme.com',
          'pass',
          ACTOR_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when tenant does not exist', async () => {
      db.enqueue('select', []); // assertTenantExists → empty

      await expect(
        service.assignTenantAdmin('bad-id', 'admin@acme.com', 'pass', ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // removeTenantAdmin
  // -------------------------------------------------------------------------

  describe('removeTenantAdmin', () => {
    it('removes the admin membership and logs audit event', async () => {
      db.enqueue('delete', [{ id: 'membership-id' }]);

      const result = await service.removeTenantAdmin(
        TENANT_ID,
        USER_ID,
        ACTOR_ID,
      );

      expect(result.removed).toBe(true);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE',
          entityType: 'tenant_membership',
        }),
      );
    });

    it('throws NotFoundException when admin membership does not exist', async () => {
      db.enqueue('delete', []); // nothing deleted

      await expect(
        service.removeTenantAdmin(TENANT_ID, USER_ID, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // patchTenantUser
  // -------------------------------------------------------------------------

  describe('patchTenantUser', () => {
    it('bans the user: updates local DB status and calls Supabase banUser', async () => {
      db.enqueue('select', [{ id: TENANT_ID }]); // assertTenantExists
      db.enqueue('select', [
        {
          id: 'membership-id',
          role: 'student',
          userId: USER_ID,
          tenantId: TENANT_ID,
        },
      ]);
      db.enqueue('update', []); // tx: update users.status

      const result = await service.patchTenantUser(
        TENANT_ID,
        USER_ID,
        { banned: true },
        ACTOR_ID,
      );

      expect(supabase.banUser).toHaveBeenCalledWith(USER_ID);
      expect(supabase.unbanUser).not.toHaveBeenCalled();
      expect(result).toMatchObject({ user_id: USER_ID, banned: true });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BAN' }),
      );
    });

    it('unbans the user: updates local DB status and calls Supabase unbanUser', async () => {
      db.enqueue('select', [{ id: TENANT_ID }]);
      db.enqueue('select', [
        {
          id: 'membership-id',
          role: 'student',
          userId: USER_ID,
          tenantId: TENANT_ID,
        },
      ]);
      db.enqueue('update', []);

      const result = await service.patchTenantUser(
        TENANT_ID,
        USER_ID,
        { banned: false },
        ACTOR_ID,
      );

      expect(supabase.unbanUser).toHaveBeenCalledWith(USER_ID);
      expect(supabase.banUser).not.toHaveBeenCalled();
      expect(result).toMatchObject({ user_id: USER_ID, banned: false });
    });

    it('throws NotFoundException when user is not a member of the tenant', async () => {
      db.enqueue('select', [{ id: TENANT_ID }]); // assertTenantExists OK
      db.enqueue('select', []); // membership not found

      await expect(
        service.patchTenantUser(TENANT_ID, USER_ID, { banned: true }, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
