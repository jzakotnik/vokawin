// src/services/userService.ts
import { prisma } from "./prismaService";
import { NotFoundError } from "./errors";

export const UserService = {
  // setters
  async create(name: string, email?: string | null) {
    return prisma.user.create({ data: { name, email: email ?? null } });
  },

  async update(id: number, data: { name?: string; email?: string | null }) {
    return prisma.user.update({ where: { id }, data });
  },

  async remove(id: number) {
    return prisma.user.delete({ where: { id } });
  },

  // getters
  async byId(id: number, withRelations = false) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: withRelations
        ? { games: true, gameConfigurations: true }
        : undefined,
    });
    if (!user) throw new NotFoundError("User", { id });
    return user;
  },

  async byEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  async all() {
    return prisma.user.findMany({ orderBy: { id: "asc" } });
  },
};
