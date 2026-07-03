import 'dotenv/config';
import { prisma } from '../config/db';
import { encryptSearchable } from '../utils/encryption';
import { env } from '../config/env';
import bcrypt from 'bcryptjs';

async function setAdminPin() {
  const phone = '6398218178';
  const pin = '123456';
  
  const encryptedPhone = encryptSearchable(phone);
  
  const pepperedPin = pin + env.security.pinPepper;
  const pinHash = await bcrypt.hash(pepperedPin, 12);

  const user = await prisma.user.upsert({
    where: { phone: encryptedPhone },
    update: { pinHash },
    create: {
      phone: encryptedPhone,
      name: 'Admin User',
      pinHash,
    },
  });

  console.log(`\n✅ Successfully set PIN to "${pin}" for admin user (+91${phone}).\n`);
  process.exit(0);

}

setAdminPin().catch((err) => {
  console.error('Failed to set PIN:', err);
  process.exit(1);
});
