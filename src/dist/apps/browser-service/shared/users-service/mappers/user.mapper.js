"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserMapper = void 0;
const common_1 = require("@nestjs/common");
let UserMapper = class UserMapper {
    toDto(user) {
        return {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: user.createdAt,
        };
    }
    toStyleProfileDto(styleProfile) {
        return {
            genderPreference: styleProfile.genderPreference ?? undefined,
            styleVibe: styleProfile.styleVibe,
            favoriteColorsHex: styleProfile.favoriteColorsHex,
            topSize: styleProfile.topSize ?? undefined,
            bottomSize: styleProfile.bottomSize ?? undefined,
            shoeSize: styleProfile.shoeSize ?? undefined,
            favoriteBrands: styleProfile.favoriteBrands,
        };
    }
    toWithStyleProfileDto(user) {
        return {
            ...this.toDto(user),
            styleProfile: user.styleProfile
                ? this.toStyleProfileDto(user.styleProfile)
                : null,
        };
    }
};
exports.UserMapper = UserMapper;
exports.UserMapper = UserMapper = __decorate([
    (0, common_1.Injectable)()
], UserMapper);
//# sourceMappingURL=user.mapper.js.map