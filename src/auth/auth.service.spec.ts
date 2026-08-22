import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock_jwt_token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();
  });

  it('deve registrar um novo usuário com sucesso', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);
    mockPrismaService.user.create.mockResolvedValue({
      id: 1,
      name: 'Carlos Silva',
      email: 'carlos@example.com',
      avatarUrl: null,
    });

    const result = await service.register({
      name: 'Carlos Silva',
      email: 'carlos@example.com',
      password: 'password123',
    });

    expect(result).toHaveProperty('token', 'mock_jwt_token');
    expect(result.user).toEqual({
      id: 1,
      name: 'Carlos Silva',
      email: 'carlos@example.com',
      avatarUrl: null,
    });
  });

  it('deve lançar ConflictException ao tentar registrar email duplicado', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({ id: 1, email: 'carlos@example.com' });

    await expect(
      service.register({
        name: 'Carlos Silva',
        email: 'carlos@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('deve logar usuário existente com credenciais corretas', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 1,
      name: 'Carlos Silva',
      email: 'carlos@example.com',
      passwordHash: hashedPassword,
      avatarUrl: null,
    });

    const result = await service.login({
      email: 'carlos@example.com',
      password: 'password123',
    });

    expect(result).toHaveProperty('token', 'mock_jwt_token');
    expect(result.user.email).toBe('carlos@example.com');
  });

  it('deve lançar UnauthorizedException com senha incorreta', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 1,
      name: 'Carlos Silva',
      email: 'carlos@example.com',
      passwordHash: hashedPassword,
      avatarUrl: null,
    });

    await expect(
      service.login({
        email: 'carlos@example.com',
        password: 'senha_errada',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
