"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEV_PORT = exports.FORGET_PASSWORD_EXPIRY = exports.FORGET_PASSWORD_PREFIX = exports.COOKIE_NAME = exports.__prod__ = void 0;
exports.__prod__ = process.env.NODE_ENV === 'production';
exports.COOKIE_NAME = 'qid';
exports.FORGET_PASSWORD_PREFIX = 'forget-password:';
exports.FORGET_PASSWORD_EXPIRY = 1000 * 60 * 60 * 24 * 3;
exports.DEV_PORT = 4000;
//# sourceMappingURL=constants.js.map