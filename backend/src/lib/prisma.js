const { PrismaClient } = require('@prisma/client');

let prisma;

try {
    prisma = new PrismaClient({
        log: ['error', 'warn'],
    });
} catch (error) {
    console.error('Failed to initialize Prisma client:', error);
    process.exit(1);
}

module.exports = { prisma };
