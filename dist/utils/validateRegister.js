"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRegister = void 0;
exports.validateRegister = (options) => {
    if (options.email.includes('@')) {
        return [
            {
                field: `email`,
                message: `enter a valid`,
            },
        ];
    }
    if (options.username.length <= 2) {
        return [
            {
                field: `username`,
                message: `username length must be greater than 2`,
            },
        ];
    }
    if (options.username.includes('@')) {
        return [
            {
                field: `username`,
                message: `username can't contain '@'`,
            },
        ];
    }
    if (options.password.length <= 3) {
        return [
            {
                field: `password`,
                message: `password length must be greater than 3`,
            },
        ];
    }
    return null;
};
//# sourceMappingURL=validateRegister.js.map