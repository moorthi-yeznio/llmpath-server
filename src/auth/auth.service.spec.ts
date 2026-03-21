import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import { AuthService } from './auth.service.js';
import { DRIZZLE } from '../db/drizzle.constants.js';

// ---------------------------------------------------------------------------
// Mock jose at the module level
// ---------------------------------------------------------------------------

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(() => 'mock-jwks'),
  jwtVerify: jest.fn(),
}));

const mockJwtVerify = jwtVerify as jest.MockedFunction<typeof jwtVerify>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a mock Drizzle chainable that resolves to `rows` on await. */
function buildDbMock(insertResult = {}, selectRows: object[] = []) {
  const selectChain = {
    from: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(selectRows),
  };

  const insertChain = {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockResolvedValue(insertResult),
  };

  return {
    select: jest.fn().mockReturnValue(selectChain),
    insert: jest.fn().mockReturnValue(insertChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
  };
}

const USER_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const TENANT_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

const BASE_ROW = {
  status: 'active' as const,
  isPlatformAdmin: false,
  tenantId: null,
  role: null,
  fullName: null,
  locale: null,
  timezone: null,
  avatarUrl: null,
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;
  let db: ReturnType<typeof buildDbMock>;

  beforeEach(async () => {
    db = buildDbMock();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DRIZZLE,
          useValue: db,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('https://example.supabase.co'),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // -------------------------------------------------------------------------
  // validateAccessToken
  // -------------------------------------------------------------------------

  describe('validateAccessToken', () => {
    it('returns AppUser for a valid token', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: USER_ID,
          email: 'alice@example.com',
          role: 'authenticated',
          aud: 'authenticated',
        },
      } as never);
      db._selectChain.where.mockResolvedValue([BASE_ROW]);

      const user = await service.validateAccessToken('valid.jwt.token');

      expect(user.id).toBe(USER_ID);
      expect(user.email).toBe('alice@example.com');
      expect(user.isPlatformAdmin).toBe(false);
      expect(user.memberships).toHaveLength(0);
    });

    it('throws UnauthorizedException when JWT verification fails', async () => {
      mockJwtVerify.mockRejectedValue(new Error('jwt expired'));

      await expect(service.validateAccessToken('expired.jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when JWT has no sub', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: '',
          email: 'alice@example.com',
          role: 'authenticated',
          aud: 'authenticated',
        },
      } as never);

      await expect(service.validateAccessToken('bad.payload')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when JWT has no email', async () => {
      mockJwtVerify.mockResolvedValue({
        payload: {
          sub: USER_ID,
          email: '',
          role: 'authenticated',
          aud: 'authenticated',
        },
      } as never);

      await expect(service.validateAccessToken('bad.payload')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // loadAppUserById
  // -------------------------------------------------------------------------

  describe('loadAppUserById', () => {
    it('returns a platform admin user with no memberships', async () => {
      db._selectChain.where.mockResolvedValue([
        { ...BASE_ROW, isPlatformAdmin: true },
      ]);

      const user = await service.loadAppUserById(USER_ID, 'admin@example.com');

      expect(user.isPlatformAdmin).toBe(true);
      expect(user.memberships).toHaveLength(0);
      expect(user.profile).toBeNull();
    });

    it('returns memberships for each tenant row', async () => {
      db._selectChain.where.mockResolvedValue([
        { ...BASE_ROW, tenantId: TENANT_ID, role: 'tutor' },
        {
          ...BASE_ROW,
          tenantId: 'bbbbbbbb-0000-0000-0000-000000000002',
          role: 'student',
        },
      ]);

      const user = await service.loadAppUserById(USER_ID, 'tutor@example.com');

      expect(user.memberships).toHaveLength(2);
      expect(user.memberships[0]).toEqual({
        tenantId: TENANT_ID,
        role: 'tutor',
      });
    });

    it('throws UnauthorizedException when account is disabled', async () => {
      db._selectChain.where.mockResolvedValue([
        { ...BASE_ROW, status: 'disabled' },
      ]);

      await expect(
        service.loadAppUserById(USER_ID, 'banned@example.com'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('performs lazy upsert on first login (new user)', async () => {
      db._selectChain.where.mockResolvedValue([BASE_ROW]);

      const user = await service.loadAppUserById(USER_ID, 'new@example.com');

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db._insertChain.onConflictDoNothing).toHaveBeenCalled();
      expect(user.id).toBe(USER_ID);
      expect(user.email).toBe('new@example.com');
    });

    it('includes profile when profile fields are present', async () => {
      db._selectChain.where.mockResolvedValue([
        {
          ...BASE_ROW,
          fullName: 'Alice Smith',
          locale: 'en',
          timezone: 'UTC',
          avatarUrl: null,
        },
      ]);

      const user = await service.loadAppUserById(USER_ID, 'alice@example.com');

      expect(user.profile).not.toBeNull();
      expect(user.profile?.full_name).toBe('Alice Smith');
      expect(user.profile?.locale).toBe('en');
    });

    it('throws UnauthorizedException when user not found after upsert', async () => {
      db._selectChain.where.mockResolvedValue([]);

      await expect(
        service.loadAppUserById(USER_ID, 'ghost@example.com'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
