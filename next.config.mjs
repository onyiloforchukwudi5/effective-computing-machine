/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["argon2", "imapflow", "nodemailer", "mailparser", "bullmq", "ioredis"],
};
export default nextConfig;
