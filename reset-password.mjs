import { scryptSync, randomBytes } from "crypto";
import pg from "pg";

const { Client } = pg;

const client = new Client({
  host: process.env.PGHOST || "localhost",
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

async function resetPassword() {
  const email = "mosamian96@gmail.com";
  const newPassword = "ILoveNahida1996";

  try {
    await client.connect();

    // Generate scrypt hash (same format as the app uses)
    const salt = randomBytes(32);
    const hash = scryptSync(newPassword, salt, 64);
    const passwordHash = `${salt.toString("hex")}:${hash.toString("hex")}`;

    // Update user
    const result = await client.query("UPDATE \"user\" SET \"passwordHash\" = $1 WHERE email = $2 RETURNING id", [
      passwordHash,
      email,
    ]);

    if (result.rowCount === 0) {
      console.log("❌ User not found");
    } else {
      console.log("✅ Password reset successfully");
      console.log("You can now log in with:");
      console.log(`  Email: ${email}`);
      console.log(`  Password: ${newPassword}`);
    }

    await client.end();
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

resetPassword();
