import { scryptSync, randomBytes } from "crypto";
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const sql = postgres({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.PGSSLMODE !== "disable" ? true : false,
});

async function resetPassword() {
  const email = "mosamian96@gmail.com";
  const newPassword = "ILoveNahida1996";

  try {
    // Generate scrypt hash
    const salt = randomBytes(32);
    const hash = scryptSync(newPassword, salt, 64);
    const passwordHash = `${salt.toString("hex")}:${hash.toString("hex")}`;

    // Update user
    const result = await sql`
      UPDATE "user"
      SET "passwordHash" = ${passwordHash}
      WHERE email = ${email}
      RETURNING id
    `;

    if (result.length === 0) {
      console.log("❌ User not found");
    } else {
      console.log("✅ Password reset successfully!");
      console.log("You can now log in with:");
      console.log(`  Email: ${email}`);
      console.log(`  Password: ${newPassword}`);
    }

    await sql.end();
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

resetPassword();
