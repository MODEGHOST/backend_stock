import bcrypt from "bcryptjs";

const password = "Devbmu999";

const hash = await bcrypt.hash(password, 10);
console.log("HASH =", hash);
