import pkg from "bcryptjs";
const { hash } = pkg;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

