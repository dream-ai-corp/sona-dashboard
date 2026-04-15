import { AuthService } from '../auth.service';
import { prisma } from '../../../config/database';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock Prisma
jest.mock('../../../config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    financeCategory: {
      createMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
  },
}));

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockedJwt = jwt as jest.Mocked<typeof jwt>;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should create a new user and return token', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (mockedBcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      (mockedPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
      });
      (mockedJwt.sign as jest.Mock).mockReturnValue('mock-token');

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBe('mock-token');
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('password123', expect.any(Number));
    });

    it('should throw if email already exists', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          displayName: 'Test User',
        }),
      ).rejects.toThrow('Email already registered');
    });
  });

  describe('login', () => {
    it('should return user and token for valid credentials', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        displayName: 'Test User',
        createdAt: new Date(),
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(true);
      (mockedJwt.sign as jest.Mock).mockReturnValue('mock-token');

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.token).toBe('mock-token');
    });

    it('should throw for invalid password', async () => {
      (mockedPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
      });
      (mockedBcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow('Invalid email or password');
    });
  });
});
