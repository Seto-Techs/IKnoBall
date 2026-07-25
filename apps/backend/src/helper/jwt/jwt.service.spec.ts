import { vi } from 'vitest';

vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(),
  verify: vi.fn(),
  decode: vi.fn(),
}));

import { JwtHelperService } from './jwt.service';
import * as jwt from 'jsonwebtoken';

const configService = { get: vi.fn() };

const createService = () => new JwtHelperService(configService as never);

describe('JwtHelperService', () => {
  let service: JwtHelperService;
  const mockSecretKey = 'test-secret-key';

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(mockSecretKey);
    service = createService();
  });

  describe('Definition', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should use JWT_SECRET from environment', () => {
      expect(service['secretKey']).toBe(mockSecretKey);
    });

    it('should use undefined when JWT_SECRET is absent', () => {
      configService.get.mockReturnValue(undefined);
      const newService = createService();
      expect(newService['secretKey']).toBeUndefined();
    });
  });

  describe('sign', () => {
    describe('Success Cases', () => {
      it('should sign a token with payload', () => {
        const payload = { sub: 'ACC-123', name: 'John Doe', role: 2 };
        const mockToken = 'signed-jwt-token';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, undefined);
      });

      it('should sign token with options', () => {
        const payload = { sub: 'ACC-123', name: 'John Doe' };
        const options = { expiresIn: '30m' };
        const mockToken = 'signed-jwt-token-with-expiry';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });

      it('should sign token with expiresIn option', () => {
        const payload = { sub: 'ACC-123' };
        const options = { expiresIn: '1h' };
        const mockToken = 'jwt-with-1h-expiry';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });

      it('should sign token with custom algorithm', () => {
        const payload = { data: 'test' };
        const options = { algorithm: 'HS512' as jwt.Algorithm };
        const mockToken = 'jwt-hs512';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });

      it('should sign token with issuer', () => {
        const payload = { sub: 'ACC-123' };
        const options = { issuer: 'my-app' };
        const mockToken = 'jwt-with-issuer';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });

      it('should sign token with audience', () => {
        const payload = { sub: 'ACC-123' };
        const options = { audience: 'api-users' };
        const mockToken = 'jwt-with-audience';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });

      it('should sign token with multiple options', () => {
        const payload = { sub: 'ACC-123', role: 2 };
        const options = {
          expiresIn: '30m',
          issuer: 'auth-service',
          audience: 'api',
        };
        const mockToken = 'jwt-with-multiple-options';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });

      it('should sign token with JTI', () => {
        const payload = { sub: 'ACC-123', jti: 'unique-jti-123' };
        const mockToken = 'jwt-with-jti';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, undefined);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty payload', () => {
        const payload = {};
        const mockToken = 'jwt-empty-payload';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, undefined);
      });

      it('should handle payload with nested objects', () => {
        const payload = {
          sub: 'ACC-123',
          user: {
            name: 'John Doe',
            role: 'admin',
            metadata: {
              department: 'IT',
            },
          },
        };
        const mockToken = 'jwt-nested-payload';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, undefined);
      });

      it('should handle payload with arrays', () => {
        const payload = {
          sub: 'ACC-123',
          permissions: ['read', 'write', 'delete'],
        };
        const mockToken = 'jwt-with-arrays';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, undefined);
      });

      it('should handle very long expiry time', () => {
        const payload = { sub: 'ACC-123' };
        const options = { expiresIn: '365d' };
        const mockToken = 'jwt-long-expiry';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });

      it('should handle numeric expiresIn (seconds)', () => {
        const payload = { sub: 'ACC-123' };
        const options = { expiresIn: 3600 }; // 1 hour in seconds
        const mockToken = 'jwt-numeric-expiry';

        (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);

        const result = service.sign(payload, options);

        expect(result).toBe(mockToken);
        expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecretKey, options);
      });
    });
  });

  describe('verify', () => {
    describe('Success Cases', () => {
      it('should verify a valid token', () => {
        const token = 'valid-jwt-token';
        const mockPayload = { sub: 'ACC-123', name: 'John Doe', role: 2 };

        (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.verify(token);

        expect(result).toEqual(mockPayload);
        expect(jwt.verify).toHaveBeenCalledWith(token, mockSecretKey);
      });

      it('should return decoded payload', () => {
        const token = 'jwt-token';
        const mockPayload = {
          sub: 'ACC-123',
          name: 'John Doe',
          role: 2,
          jti: 'jti123',
          iat: 1234567890,
          exp: 1234569690,
        };

        (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.verify(token);

        expect(result).toEqual(mockPayload);
        expect(result.sub).toBe('ACC-123');
        expect(result.jti).toBe('jti123');
      });

      it('should verify token with all claims', () => {
        const token = 'complete-jwt-token';
        const mockPayload = {
          sub: 'ACC-123',
          name: 'Admin User',
          role: 1,
          jti: 'unique-jti',
          iat: 1234567890,
          exp: 1234569690,
          iss: 'auth-service',
          aud: 'api',
        };

        (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.verify(token);

        expect(result).toEqual(mockPayload);
        expect(result.iss).toBe('auth-service');
        expect(result.aud).toBe('api');
      });
    });

    describe('Error Cases', () => {
      it('should throw error for invalid token', () => {
        const token = 'invalid-token';

        (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('jwt malformed');
        });

        expect(() => service.verify(token)).toThrow('Invalid token');
      });

      it('should throw error for expired token', () => {
        const token = 'expired-token';

        (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('jwt expired');
        });

        expect(() => service.verify(token)).toThrow('Invalid token');
      });

      it('should throw error for token with invalid signature', () => {
        const token = 'token-wrong-signature';

        (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('invalid signature');
        });

        expect(() => service.verify(token)).toThrow('Invalid token');
      });

      it('should throw error for tampered token', () => {
        const token = 'tampered-token';

        (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('invalid token');
        });

        expect(() => service.verify(token)).toThrow('Invalid token');
      });

      it('should wrap any jwt error as "Invalid token"', () => {
        const token = 'problematic-token';

        (jwt.verify as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('some jwt error');
        });

        expect(() => service.verify(token)).toThrow('Invalid token');
      });
    });

    describe('Edge Cases', () => {
      it('should handle token with special characters in payload', () => {
        const token = 'jwt-special-chars';
        const mockPayload = {
          sub: 'ACC-123',
          name: "O'Brien & Sons",
          email: 'user+test@example.com',
        };

        (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.verify(token);

        expect(result).toEqual(mockPayload);
        expect(result.name).toBe("O'Brien & Sons");
      });

      it('should handle very long token', () => {
        const token = 'a'.repeat(1000);
        const mockPayload = { sub: 'ACC-123' };

        (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.verify(token);

        expect(result).toEqual(mockPayload);
      });

      it('should handle token about to expire', () => {
        const token = 'almost-expired-token';
        const now = Math.floor(Date.now() / 1000);
        const mockPayload = {
          sub: 'ACC-123',
          iat: now - 1799,
          exp: now + 1,
        };

        (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.verify(token);

        expect(result).toEqual(mockPayload);
      });

      it('should handle token with extra claims', () => {
        const token = 'jwt-extra-claims';
        const mockPayload = {
          sub: 'ACC-123',
          name: 'John Doe',
          role: 2,
          jti: 'jti123',
          custom_field: 'custom_value',
          another_field: 123,
        };

        (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.verify(token);

        expect(result).toEqual(mockPayload);
        expect(result.custom_field).toBe('custom_value');
      });
    });
  });

  describe('decode', () => {
    describe('Success Cases', () => {
      it('should decode token without verification', () => {
        const token = 'jwt-token-to-decode';
        const mockPayload = { sub: 'ACC-123', name: 'John Doe', role: 2 };

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.decode(token);

        expect(result).toEqual(mockPayload);
        expect(jwt.decode).toHaveBeenCalledWith(token);
      });

      it('should decode expired token (no verification)', () => {
        const token = 'expired-jwt-token';
        const mockPayload = {
          sub: 'ACC-123',
          name: 'John Doe',
          iat: 1234567890,
          exp: 1234569690,
        };

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.decode(token);

        expect(result).toEqual(mockPayload);
        expect(jwt.decode).toHaveBeenCalledWith(token);
      });

      it('should decode token with full payload', () => {
        const token = 'complete-jwt-token';
        const mockPayload = {
          sub: 'ACC-123',
          name: 'Admin User',
          role: 1,
          jti: 'unique-jti',
          iat: 1234567890,
          exp: 1234569690,
          iss: 'auth-service',
          aud: 'api',
        };

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.decode(token);

        expect(result).toEqual(mockPayload);
        expect(result.iss).toBe('auth-service');
        expect(result.aud).toBe('api');
      });

      it('should decode token to inspect claims', () => {
        const token = 'jwt-for-inspection';
        const mockPayload = {
          sub: 'ACC-123',
          role: 2,
          permissions: ['read', 'write'],
        };

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.decode(token);

        expect(result).toEqual(mockPayload);
        expect(result.permissions).toEqual(['read', 'write']);
      });
    });

    describe('Edge Cases', () => {
      it('should return null for invalid token format', () => {
        const token = 'not-a-valid-jwt';

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const result = service.decode(token);

        expect(result).toBeNull();
        expect(jwt.decode).toHaveBeenCalledWith(token);
      });

      it('should handle empty string token', () => {
        const token = '';

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(null);

        const result = service.decode(token);

        expect(result).toBeNull();
      });

      it('should decode token with nested objects', () => {
        const token = 'jwt-nested';
        const mockPayload = {
          sub: 'ACC-123',
          user: {
            profile: {
              name: 'John Doe',
              age: 30,
            },
          },
        };

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.decode(token);

        expect(result).toEqual(mockPayload);
        expect(result.user.profile.name).toBe('John Doe');
      });

      it('should decode token with array payload', () => {
        const token = 'jwt-array';
        const mockPayload = {
          sub: 'ACC-123',
          roles: ['admin', 'user', 'moderator'],
        };

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.decode(token);

        expect(result).toEqual(mockPayload);
        expect(result.roles).toHaveLength(3);
      });

      it('should decode very long token', () => {
        const token = 'a'.repeat(2000);
        const mockPayload = { sub: 'ACC-123', data: 'x'.repeat(1000) };

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockPayload);

        const result = service.decode(token);

        expect(result).toEqual(mockPayload);
      });

      it('should handle decode returning string (header only)', () => {
        const token = 'jwt-header-only';
        const mockResult = 'header-string';

        (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(mockResult);

        const result = service.decode(token);

        expect(result).toBe(mockResult);
      });
    });
  });

  describe('Secret Key Management', () => {
    it('uses the configured JWT_SECRET', () => {
      configService.get.mockReturnValue('my-custom-secret');
      expect(createService()['secretKey']).toBe('my-custom-secret');
    });

    it('preserves an empty JWT_SECRET', () => {
      configService.get.mockReturnValue('');
      expect(createService()['secretKey']).toBe('');
    });

    it('preserves special characters in JWT_SECRET', () => {
      configService.get.mockReturnValue('my!@#$%^&*()secret');
      expect(createService()['secretKey']).toBe('my!@#$%^&*()secret');
    });
  });

  describe('Integration Scenarios', () => {
    it('should sign and verify token successfully', () => {
      const payload = { sub: 'ACC-123', name: 'John Doe', role: 2 };
      const mockToken = 'signed-token';

      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);
      (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(payload);

      const token = service.sign(payload);
      const verified = service.verify(token);

      expect(token).toBe(mockToken);
      expect(verified).toEqual(payload);
    });

    it('should sign and decode token successfully', () => {
      const payload = { sub: 'ACC-123', name: 'John Doe' };
      const mockToken = 'signed-token';

      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);
      (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(payload);

      const token = service.sign(payload);
      const decoded = service.decode(token);

      expect(token).toBe(mockToken);
      expect(decoded).toEqual(payload);
    });

    it('should handle sign, verify, and decode workflow', () => {
      const payload = { sub: 'ACC-123', role: 2, jti: 'jti123' };
      const mockToken = 'workflow-token';
      const verifiedPayload = { ...payload, iat: 123, exp: 456 };

      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue(mockToken);
      (jwt.verify as ReturnType<typeof vi.fn>).mockReturnValue(verifiedPayload);
      (jwt.decode as ReturnType<typeof vi.fn>).mockReturnValue(verifiedPayload);

      const token = service.sign(payload, { expiresIn: '30m' });
      const verified = service.verify(token);
      const decoded = service.decode(token);

      expect(token).toBe(mockToken);
      expect(verified).toEqual(verifiedPayload);
      expect(decoded).toEqual(verifiedPayload);
    });
  });
});
