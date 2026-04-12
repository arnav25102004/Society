-- Add Expo push token to users for FCM notifications
ALTER TABLE "users" ADD COLUMN "expoPushToken" TEXT;
