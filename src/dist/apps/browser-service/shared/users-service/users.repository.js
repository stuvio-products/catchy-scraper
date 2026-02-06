"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let UsersRepository = class UsersRepository {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findByEmail(email) {
        return this.prisma.client.user.findUnique({
            where: { email },
        });
    }
    async findById(id) {
        return this.prisma.client.user.findUnique({
            where: { id },
        });
    }
    async findByIdWithStyleProfile(id) {
        return this.prisma.client.user.findUnique({
            where: { id },
            include: {
                styleProfile: true,
            },
        });
    }
    async create(data) {
        return this.prisma.client.user.create({
            data: {
                email: data.email,
                passwordHash: data.passwordHash,
                firstName: data.firstName,
                lastName: data.lastName,
                loginType: 'PASSWORD',
            },
        });
    }
    async softDelete(id) {
        return this.prisma.client.user.update({
            where: { id },
            data: { isDeleted: true },
        });
    }
    async update(id, data) {
        return this.prisma.client.user.update({
            where: { id },
            data,
        });
    }
    async createOrUpdateStyleProfile(userId, data) {
        return this.prisma.client.userStyleProfile.upsert({
            where: { userId },
            update: {
                ...data,
            },
            create: {
                userId,
                ...data,
            },
        });
    }
    async findStyleProfileByUserId(userId) {
        return this.prisma.client.userStyleProfile.findUnique({
            where: { userId },
        });
    }
};
exports.UsersRepository = UsersRepository;
exports.UsersRepository = UsersRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersRepository);
//# sourceMappingURL=users.repository.js.map