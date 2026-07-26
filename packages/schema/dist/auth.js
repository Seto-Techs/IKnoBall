"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshSchema = exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.loginSchema = exports.resendVerificationSchema = exports.verifyEmailSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.email().max(255),
    name: zod_1.z.string().min(2).max(100),
    password: zod_1.z.string().min(8).max(128),
});
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
});
exports.resendVerificationSchema = zod_1.z.object({
    email: zod_1.z.email(),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.email(),
    password: zod_1.z.string().min(1),
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.email(),
});
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(128),
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
