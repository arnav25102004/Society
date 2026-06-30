/**
 * One-time migration script to encrypt existing PII in the database.
 * Run AFTER deploying the encryption utility and BEFORE going live with new code.
 *
 * IMPORTANT: Run in a maintenance window. Back up your DB first.
 * Run: npx ts-node src/scripts/encrypt-existing-pii.ts
 */

import 'dotenv/config';
import { prisma } from '../config/db';
import { encryptSearchable, encryptField, isEncrypted } from '../utils/encryption';

async function encryptUsers() {
  console.log('\n[1/3] Encrypting users.phone and users.email...');
  const users = await prisma.user.findMany({ select: { id: true, phone: true, email: true } });
  let count = 0;
  for (const user of users) {
    const updates: { phone?: string; email?: string } = {};
    if (user.phone && !isEncrypted(user.phone)) {
      updates.phone = encryptSearchable(user.phone);
    }
    if (user.email && !isEncrypted(user.email)) {
      updates.email = encryptField(user.email);
    }
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({ where: { id: user.id }, data: updates });
      count++;
    }
  }
  console.log(`  ✅ Encrypted ${count}/${users.length} user records`);
}

async function encryptMembers() {
  console.log('\n[2/3] Encrypting society_members.flat_number...');
  const members = await prisma.societyMember.findMany({ select: { id: true, flatNumber: true } });
  let count = 0;
  for (const member of members) {
    if (member.flatNumber && !isEncrypted(member.flatNumber)) {
      await prisma.societyMember.update({
        where: { id: member.id },
        data:  { flatNumber: encryptSearchable(member.flatNumber) },
      });
      count++;
    }
  }
  console.log(`  ✅ Encrypted ${count}/${members.length} member records`);
}

async function encryptPreApprovals() {
  console.log('\n[3/3] Encrypting pre_approvals.visitor_phone...');
  const approvals = await prisma.preApproval.findMany({ select: { id: true, visitorPhone: true } });
  let count = 0;
  for (const approval of approvals) {
    if (approval.visitorPhone && !isEncrypted(approval.visitorPhone)) {
      await prisma.preApproval.update({
        where: { id: approval.id },
        data:  { visitorPhone: encryptField(approval.visitorPhone) },
      });
      count++;
    }
  }
  console.log(`  ✅ Encrypted ${count}/${approvals.length} pre-approval records`);
}

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  PII Encryption Migration');
  console.log('═══════════════════════════════════════════');
  console.log('  Using AES_ENCRYPTION_KEY from environment');

  await prisma.$connect();
  await encryptUsers();
  await encryptMembers();
  await encryptPreApprovals();
  await prisma.$disconnect();

  console.log('\n═══════════════════════════════════════════');
  console.log('  Migration complete ✅');
  console.log('═══════════════════════════════════════════\n');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
