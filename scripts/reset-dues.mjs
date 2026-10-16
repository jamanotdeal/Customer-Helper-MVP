#!/usr/bin/env node
/**
 * One-time script: Reset ALL store due amounts to 0 in Firestore
 * 
 * The "Due" amount shown in Store/Admin panels is computed as the sum of
 * net sales from DELIVERED orders where isStorePaid !== true.
 * 
 * This script marks ALL such orders as isStorePaid = true,
 * which effectively resets the displayed due balance to 0.
 * 
 * Run: node scripts/reset-dues.mjs
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDSN_Q5PTgnL7nTm0Ni1yktCculx6jlRYY",
  authDomain: "jamanot-pwa.firebaseapp.com",
  projectId: "jamanot-pwa",
  storageBucket: "jamanot-pwa.firebasestorage.app",
  messagingSenderId: "685363529279",
  appId: "1:685363529279:web:fcdd94d0e5181b7b4b9a8a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function resetAllStoreDues() {
  console.log('🔍 Fetching all orders from Firestore...');

  const ordersSnap = await getDocs(collection(db, 'orders'));
  console.log(`📦 Total orders found: ${ordersSnap.docs.length}`);

  // Find orders that are DELIVERED but not yet marked as paid to the store
  const unpaidDeliveredOrders = ordersSnap.docs.filter((d) => {
    const data = d.data();
    const status = (data.status || '').toUpperCase();
    const isDelivered = status === 'DELIVERED' || status === 'COMPLETED';
    const isStorePaid = data.isStorePaid === true || data.isPaid === true;
    return isDelivered && !isStorePaid;
  });

  console.log(`💰 Delivered orders NOT yet marked as store-paid: ${unpaidDeliveredOrders.length}`);

  if (unpaidDeliveredOrders.length === 0) {
    console.log('✅ All delivered orders are already marked as store-paid. Due balance is already 0.');
    process.exit(0);
  }

  // Show sample
  const sample = unpaidDeliveredOrders.slice(0, 10);
  console.log('\nSample of orders to be marked as store-paid:');
  sample.forEach((d) => {
    const data = d.data();
    console.log(`  - Order ${d.id}: status=${data.status}, shopId=${data.shopId || 'N/A'}, productCost=৳${data.productCost || 0}`);
  });
  if (unpaidDeliveredOrders.length > 10) {
    console.log(`  ... and ${unpaidDeliveredOrders.length - 10} more`);
  }

  console.log(`\n⚡ Marking ${unpaidDeliveredOrders.length} order(s) as isStorePaid=true to zero out the due balance...`);

  const BATCH_SIZE = 400;
  let totalUpdated = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < unpaidDeliveredOrders.length; i += BATCH_SIZE) {
    const chunk = unpaidDeliveredOrders.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);

    chunk.forEach((d) => {
      const ref = doc(db, 'orders', d.id);
      batch.update(ref, {
        isStorePaid: true,
        storePaidAt: now,
        storePaidNote: `Bulk reset by admin on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} — prior dues cleared`,
        updatedAt: now,
      });
    });

    await batch.commit();
    totalUpdated += chunk.length;
    console.log(`  ✓ Batch committed: ${totalUpdated}/${unpaidDeliveredOrders.length}`);
  }

  console.log(`\n✅ Done! Marked ${totalUpdated} order(s) as store-paid.`);
  console.log('🎯 Store/Admin due balance is now 0. Future orders will be tracked cleanly from here.');
  process.exit(0);
}

resetAllStoreDues().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
