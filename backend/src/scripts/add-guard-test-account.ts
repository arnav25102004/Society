import 'dotenv/config';
import { prisma } from '../config/db';
import { encryptSearchable } from '../utils/encryption';

const PHONE = '7411825558';
const SOCIETY_ID = 'de30e82f-a4a0-4d01-a3a1-a4411b2ccd94'; // Orchid Heights
const FLAT_NUMBER = 'GATE-1'; // guards don't own a flat — used as a placeholder label

async function addGuardTestAccount() {
  const encryptedPhone = encryptSearchable(PHONE);

  let user = await prisma.user.findUnique({ where: { phone: encryptedPhone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone: encryptedPhone, name: 'Test Guard' } });
    console.log(`Created new user for +91${PHONE}`);
  } else {
    console.log(`Found existing user for +91${PHONE}`);
  }

  const existingMembership = await prisma.societyMember.findFirst({
    where: { userId: user.id, societyId: SOCIETY_ID },
  });

  if (existingMembership) {
    const updated = await prisma.societyMember.update({
      where: { id: existingMembership.id },
      data: { role: 'guard', status: 'approved' },
    });
    console.log(`Updated existing membership ${updated.id} to role=guard, status=approved`);
  } else {
    const created = await prisma.societyMember.create({
      data: {
        userId: user.id,
        societyId: SOCIETY_ID,
        flatNumber: encryptSearchable(FLAT_NUMBER),
        role: 'guard',
        status: 'approved',
      },
    });
    console.log(`Created new guard membership ${created.id}`);
  }

  console.log(`\n✅ +91${PHONE} is now an approved guard on Orchid Heights.\n`);
  process.exit(0);
}

addGuardTestAccount().catch((err) => {
  console.error('Failed to add guard test account:', err);
  process.exit(1);
});
