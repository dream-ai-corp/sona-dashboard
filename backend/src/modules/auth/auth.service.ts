import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { config } from '../../config';
import { AppError } from '../../core/middleware/error-handler.middleware';
import { RegisterInput, LoginInput } from './auth.validator';

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });

    await this.seedDefaultCategories(user.id);

    const token = this.generateToken(user.id, user.email);
    return { user, token };
  }

  private async seedDefaultCategories(userId: string) {
    await prisma.financeCategory.createMany({
      data: [
        { userId, name: 'Salary', lifeArea: 'CARRIERE', type: 'INCOME' },
        { userId, name: 'Groceries', lifeArea: 'SANTE', type: 'EXPENSE' },
        { userId, name: 'Rent', lifeArea: 'ORGANISATION', type: 'EXPENSE' },
        { userId, name: 'Transport', lifeArea: 'ORGANISATION', type: 'EXPENSE' },
      ],
    });
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const token = this.generateToken(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, createdAt: true },
    });
    return user;
  }

  private generateToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);
  }
}

export const authService = new AuthService();
