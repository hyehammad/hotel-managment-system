import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Seeding staff accounts into Railway MySQL...\n");

  // 1. Fetch or create available roles
  let maintenanceRole = await prisma.roles.findUnique({ where: { role_name: "Maintenance" } });
  if (!maintenanceRole) {
    maintenanceRole = await prisma.roles.create({
      data: {
        role_name: "Maintenance",
        description: "Room repairs, technical fixes, and physical maintenance",
      },
    });
    console.log("✓ Created Maintenance role in database");
  }

  const roles = await prisma.roles.findMany();
  const roleMap = new Map(roles.map((r) => [r.role_name, r.role_id]));

  console.log("Found roles in database:");
  for (const r of roles) {
    console.log(`- Role ID ${r.role_id}: ${r.role_name}`);
  }
  console.log("");

  const adminRoleId = roleMap.get("Admin") || 1;
  const managerRoleId = roleMap.get("Manager") || 2;
  const receptionistRoleId = roleMap.get("Receptionist") || 3;
  const housekeepingRoleId = roleMap.get("Housekeeping") || 4;
  const maintenanceRoleId = roleMap.get("Maintenance") || maintenanceRole.role_id;

  // 2. Hash default passwords using Argon2id
  console.log("Generating Argon2id password hashes...");
  const adminPassword = "Admin123!@#";
  const managerPassword = "Manager123!@#";
  const receptionistPassword = "Reception123!@#";
  const housekeeperPassword = "Housekeeper123!@#";
  const maintenancePassword = "Maintenance123!@#";

  const adminHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  const managerHash = await argon2.hash(managerPassword, { type: argon2.argon2id });
  const receptionistHash = await argon2.hash(receptionistPassword, { type: argon2.argon2id });
  const housekeeperHash = await argon2.hash(housekeeperPassword, { type: argon2.argon2id });
  const maintenanceHash = await argon2.hash(maintenancePassword, { type: argon2.argon2id });

  // 3. Create or update the System staff account (for online payment processing)
  const systemAccount = await prisma.staff.upsert({
    where: { username: "system_gateway" },
    update: {},
    create: {
      role_id: adminRoleId,
      first_name: "System",
      last_name: "Gateway",
      username: "system_gateway",
      email: "system@hotel.internal",
      phone: "0000000000",
      password_hash: await argon2.hash("DISABLED_" + Math.random(), { type: argon2.argon2id }),
      hire_date: new Date(),
      is_active: true,
    },
  });
  console.log(`✓ System Staff Account: ID ${systemAccount.staff_id} (used for automated online payments)`);

  // 4. Create primary Administrator account
  const adminAccount = await prisma.staff.upsert({
    where: { username: "admin" },
    update: { password_hash: adminHash, is_active: true },
    create: {
      role_id: adminRoleId,
      first_name: "System",
      last_name: "Administrator",
      username: "admin",
      email: "admin@hotel.com",
      phone: "+923001234567",
      password_hash: adminHash,
      hire_date: new Date(),
      is_active: true,
    },
  });
  console.log(`✓ Admin Account: ID ${adminAccount.staff_id} (Username: admin)`);

  // 5. Create sample Manager account
  const managerAccount = await prisma.staff.upsert({
    where: { username: "manager" },
    update: { password_hash: managerHash, is_active: true },
    create: {
      role_id: managerRoleId,
      first_name: "Hotel",
      last_name: "Manager",
      username: "manager",
      email: "manager@hotel.com",
      phone: "+923002345678",
      password_hash: managerHash,
      hire_date: new Date(),
      is_active: true,
    },
  });
  console.log(`✓ Manager Account: ID ${managerAccount.staff_id} (Username: manager)`);

  // 6. Create sample Receptionist account
  const receptionistAccount = await prisma.staff.upsert({
    where: { username: "receptionist" },
    update: { password_hash: receptionistHash, is_active: true },
    create: {
      role_id: receptionistRoleId,
      first_name: "Frontdesk",
      last_name: "Receptionist",
      username: "receptionist",
      email: "reception@hotel.com",
      phone: "+923003456789",
      password_hash: receptionistHash,
      hire_date: new Date(),
      is_active: true,
    },
  });
  console.log(`✓ Receptionist Account: ID ${receptionistAccount.staff_id} (Username: receptionist)`);

  // 7. Create sample Housekeeper account
  const housekeeperAccount = await prisma.staff.upsert({
    where: { username: "housekeeper" },
    update: { password_hash: housekeeperHash, is_active: true },
    create: {
      role_id: housekeepingRoleId,
      first_name: "Lead",
      last_name: "Housekeeper",
      username: "housekeeper",
      email: "housekeeping@hotel.com",
      phone: "+923004567890",
      password_hash: housekeeperHash,
      hire_date: new Date(),
      is_active: true,
    },
  });
  console.log(`✓ Housekeeper Account: ID ${housekeeperAccount.staff_id} (Username: housekeeper)`);

  // 8. Create sample Maintenance account
  const maintenanceAccount = await prisma.staff.upsert({
    where: { username: "maintenance" },
    update: { password_hash: maintenanceHash, is_active: true },
    create: {
      role_id: maintenanceRoleId,
      first_name: "Chief",
      last_name: "Technician",
      username: "maintenance",
      email: "maintenance@hotel.com",
      phone: "+923005678901",
      password_hash: maintenanceHash,
      hire_date: new Date(),
      is_active: true,
    },
  });
  console.log(`✓ Maintenance Account: ID ${maintenanceAccount.staff_id} (Username: maintenance)`);

  console.log("\n=======================================================");
  console.log("            STAFF CREDENTIALS SUMMARY                  ");
  console.log("=======================================================");
  console.log("Role         | Username      | Password");
  console.log("-------------+---------------+------------------------");
  console.log(`Admin        | admin         | ${adminPassword}`);
  console.log(`Manager      | manager       | ${managerPassword}`);
  console.log(`Receptionist | receptionist  | ${receptionistPassword}`);
  console.log(`Housekeeper  | housekeeper   | ${housekeeperPassword}`);
  console.log(`Maintenance  | maintenance   | ${maintenancePassword}`);
  console.log(`System Bot   | system_gateway| [Disabled for login]`);
  console.log("=======================================================\n");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
