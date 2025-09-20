import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function listUsers(params: Prisma.UserFindManyArgs = {}) {
  return prisma.user.findMany(params);
}

export async function createUser(data: Prisma.UserCreateInput) {
  return prisma.user.create({ data });
}

export async function updateUser(
  where: Prisma.UserWhereUniqueInput,
  data: Prisma.UserUpdateInput
) {
  return prisma.user.update({ where, data });
}

export async function deleteUser(where: Prisma.UserWhereUniqueInput) {
  return prisma.user.delete({ where });
}

export async function countUsers(where?: Prisma.UserWhereInput) {
  return prisma.user.count({ where });
}

// Relation helpers
export async function listUserGameConfigurations(userId: number) {
  return prisma.gameConfiguration.findMany({ where: { userId } });
}

export async function listUserGames(userId: number) {
  return prisma.game.findMany({ where: { userId } });
}
