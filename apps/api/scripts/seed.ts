import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run seed");
}

const pool = new Pool({ connectionString: databaseUrl });

const now = new Date().toISOString();

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `
        insert into users (id, phone, name, referral_code, role, blocked, created_at)
        values
          ('admin_super', '9999999999', 'Super Admin', 'ADMIN999', 'superadmin', false, $1),
          ('admin_operator', '8888888888', 'Operator', 'OPS888', 'operator', false, $1)
        on conflict (id) do update
        set phone = excluded.phone,
            name = excluded.name,
            referral_code = excluded.referral_code,
            role = excluded.role,
            blocked = excluded.blocked
      `,
      [now],
    );

    await client.query(
      `
        insert into admin_users (user_id, login_phone, role, created_at)
        values
          ('admin_super', '9999999999', 'superadmin', $1),
          ('admin_operator', '8888888888', 'operator', $1)
        on conflict (user_id) do update
        set login_phone = excluded.login_phone,
            role = excluded.role
      `,
      [now],
    );

    await client.query(
      `
        insert into reward_rules (id, min_deposit_amount, max_deposit_amount, reward_percent, active, created_at)
        values
          ('rule_1', 100, 499, 3, true, $1),
          ('rule_2', 500, 999, 5, true, $1),
          ('rule_3', 1000, 100000, 7, true, $1)
        on conflict (id) do update
        set min_deposit_amount = excluded.min_deposit_amount,
            max_deposit_amount = excluded.max_deposit_amount,
            reward_percent = excluded.reward_percent,
            active = excluded.active
      `,
      [now],
    );

    await client.query(
      `
        insert into chunk_buckets (id, label, min_amount, max_amount, target_amount, active)
        values
          ('bucket_small', '100-200', 100, 200, 200, true),
          ('bucket_medium', '200-500', 200, 500, 300, true),
          ('bucket_large', '500-1000', 500, 1000, 500, true)
        on conflict (id) do update
        set label = excluded.label,
            min_amount = excluded.min_amount,
            max_amount = excluded.max_amount,
            target_amount = excluded.target_amount,
            active = excluded.active
      `,
    );

    await client.query(
      `
        insert into demand_pools (id, bucket_id, label, requested_amount, remaining_amount, priority, active, created_at)
        values
          ('demand_small', 'bucket_small', 'Small demand', 1000, 1000, 1, true, $1),
          ('demand_medium', 'bucket_medium', 'Medium demand', 1500, 1500, 2, true, $1),
          ('demand_large', 'bucket_large', 'Large demand', 2000, 2000, 3, true, $1)
        on conflict (id) do update
        set bucket_id = excluded.bucket_id,
            label = excluded.label,
            requested_amount = excluded.requested_amount,
            remaining_amount = excluded.remaining_amount,
            priority = excluded.priority,
            active = excluded.active
      `,
      [now],
    );

    await client.query("commit");
    console.log("Seed complete");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
