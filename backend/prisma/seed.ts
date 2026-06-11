/**
 * Seed script — creates your pilot society in the database.
 * Run with: npm run db:seed
 * Or against Neon directly: DATABASE_URL="..." npm run db:seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Pilot society config ─────────────────────────────────────────────────────
// Edit these before running the seed.

const SOCIETY = {
  name: 'Model Town Apartments',
  address: 'Model Town, Bengaluru',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  totalFlats: 48,
  // Residents type this code in the app to join.
  // Change it — keep it short and memorable (e.g. your society initials + pin digits).
  societyCode: 'MDLTN01',
};

// Flat numbering: edit to match your society's actual flat numbers.
// Below generates A101–A104, A201–A204, ... B101–B104 ... C101–C104 (4 blocks × 4 floors × 4 units = 64 flats)
// Trim or replace this list with your actual flat numbers.
function generateFlats(): string[] {
  const flats: string[] = [];
  const blocks = ['A', 'B', 'C'];
  const floors = [1, 2, 3, 4];
  const unitsPerFloor = 4;

  for (const block of blocks) {
    for (const floor of floors) {
      for (let unit = 1; unit <= unitsPerFloor; unit++) {
        flats.push(`${block}${floor}0${unit}`);
      }
    }
  }
  return flats;
}

// ─── Committee member ─────────────────────────────────────────────────────────
// The first committee member is created here so someone can approve residents.
// Replace the phone number with the actual committee admin's number.
// They will log in via OTP using this number.
const COMMITTEE_ADMIN = {
  phone: '9999999999', // ← REPLACE with real committee member phone
  name: 'Society Admin',
  flatNumber: 'A101',   // ← their flat number
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding pilot society...\n');

  // Upsert society (safe to re-run)
  const society = await prisma.society.upsert({
    where: { societyCode: SOCIETY.societyCode },
    update: {
      name: SOCIETY.name,
      totalFlats: SOCIETY.totalFlats,
    },
    create: {
      ...SOCIETY,
    },
  });

  console.log(`Society created/updated: "${society.name}" (code: ${society.societyCode})`);
  console.log(`Society ID: ${society.id}\n`);

  // Create committee admin user (upsert by phone)
  const adminUser = await prisma.user.upsert({
    where: { phone: COMMITTEE_ADMIN.phone },
    update: { name: COMMITTEE_ADMIN.name },
    create: {
      phone: COMMITTEE_ADMIN.phone,
      name: COMMITTEE_ADMIN.name,
    },
  });

  // Add them as an approved committee member
  await prisma.societyMember.upsert({
    where: {
      societyId_flatNumber_userId: {
        societyId: society.id,
        flatNumber: COMMITTEE_ADMIN.flatNumber,
        userId: adminUser.id,
      },
    },
    update: { role: 'committee', status: 'approved' },
    create: {
      societyId: society.id,
      userId: adminUser.id,
      flatNumber: COMMITTEE_ADMIN.flatNumber,
      role: 'committee',
      status: 'approved',
    },
  });

  console.log(`Committee admin: ${COMMITTEE_ADMIN.name} (+91 ${COMMITTEE_ADMIN.phone}) → Flat ${COMMITTEE_ADMIN.flatNumber}`);

  const flatList = generateFlats();
  console.log(`\nFlat numbers generated: ${flatList.join(', ')}`);
  console.log(`\nTotal flats: ${flatList.length}`);

  console.log('\n─────────────────────────────────────────────────────');
  console.log('Seed complete. Share these details with residents:\n');
  console.log(`  Society code: ${society.societyCode}`);
  console.log(`  App login: phone OTP → enter code → select flat`);
  console.log('\nCommittee admin must log in and approve join requests.');
  console.log('─────────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
