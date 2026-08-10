import { Metadata } from 'next';

export const SEO_DATA: Record<string, { title: string; description: string; keywords: string }> = {
  'bazar-sodai korte hobe': {
    title: 'বাজার-সদাই ও কাঁচাবাজার ডেলিভারি সার্ভিস | Jamanot',
    description: 'আপনার নিত্যদিনের কাঁচাবাজার, বাজার-সদাই ও গ্রোসারি সরাসরি আপনার দরজায় পৌঁছে দিতে নিয়োজিত আছেন জামানত হেলপার।',
    keywords: 'বাজার, সদাই, গ্রোসারি ডেলিভারি, কাঁচাবাজার, জামানত, Jamanot Bazar, Grocery Delivery',
  },
  'khabar ante hobe': {
    title: 'রেস্টুরেন্ট ও ঘরের গরম খাবার ডেলিভারি | Jamanot',
    description: 'পছন্দের রেস্টুরেন্ট বা ঘরের তৈরি গরম খাবার সহজে ও দ্রুত সময়ে আপনার ঠিকানায় নিয়ে আসবে জামানত হেলপার।',
    keywords: 'খাবার ডেলিভারি, রেস্টুরেন্ট খাবার, গরম খাবার, জামানত ফুড, Food Delivery, Jamanot Food',
  },
  'medicine ante hobe': {
    title: 'জরুরি ওষুধ হোম ডেলিভারি সার্ভিস | Jamanot',
    description: 'যেকোনো ফার্মেসি বা হাসপাতাল থেকে আপনার প্রয়োজনীয় জরুরি ওষুধ দ্রুত সংগ্রহ ও হোম ডেলিভারি সেবা।',
    keywords: 'ওষুধ ডেলিভারি, মেডিসিন হোম ডেলিভারি, জরুরি ফার্মেসি, জামানত মেডিসিন, Medicine Delivery Bangladesh',
  },
  'zuta selai korte hobe': {
    title: 'জুতো সেলাই ও অন্যান্য পার্সোনাল এসিস্ট্যান্স | Jamanot',
    description: 'জুতো সেলাই, লন্ড্রি বা যেকোনো গৃহস্থালি ফুটফরমাশ খাটার নির্ভরযোগ্য পার্সোনাল হেল্পার সার্ভিস।',
    keywords: 'জুতো সেলাই, লন্ড্রি সার্ভিস, ফুটফরমাশ, জামানত হেল্পার, Personal Helper, Errands Service',
  },
  'amar parcel recive kore dite hobe': {
    title: 'পার্সেল রিসিভ ও কুরিয়ার ডেলিভারি সার্ভিস | Jamanot',
    description: 'জরুরি পার্সেল, ফাইল বা ডকুমেন্ট নিরাপদে ও দ্রুত এক স্থান থেকে অন্য স্থানে পাঠানো ও রিসিভ করার নির্ভরযোগ্য সেবা।',
    keywords: 'পার্সেল ডেলিভারি, ডকুমেন্ট ডেলিভারি, কুরিয়ার সার্ভিস, জামানত পার্সেল, Parcel Delivery',
  },
  'mix': {
    title: 'মাল্টিপল ফুটফরমাশ ও পার্সোনাল হেল্পার | Jamanot',
    description: 'বাজার, ওষুধ বা কুরিয়ার সব কাজ একসাথে করুন। জামানতের দক্ষ হেলপার আপনার সব প্রয়োজন মেটাতে প্রস্তুত।',
    keywords: 'পার্সোনাল হেল্পার, ফুটফরমাশ, জামানত মাল্টিটাস্কিং, Personal Helper Bangladesh',
  },
};

export const DEFAULT_SEO = {
  title: 'Jamanot — Ask. Relax. Done.',
  description: 'Fast, minimalistic mobile-first personal helper service for on-demand nearby shopping, errands, parcel receiving and delivery.',
  keywords: 'ব্যক্তিগত হেল্পার, পার্সোনাল এসিস্ট্যান্ট, অন-ডিমান্ড সার্ভিস, জামানত, Jamanot Helper, Personal Assistance',
};

export function getSEOMetadataForService(serviceName?: string) {
  if (!serviceName) return DEFAULT_SEO;
  const key = serviceName.trim().toLowerCase();
  
  // Try exact match or fuzzy match
  let found = SEO_DATA[key];
  if (!found) {
    const matchKey = Object.keys(SEO_DATA).find(k => key.includes(k) || k.includes(key));
    if (matchKey) {
      found = SEO_DATA[matchKey];
    }
  }

  if (found) return found;

  return {
    title: `${serviceName} | Jamanot`,
    description: `জামানত অন-ডিমান্ড সার্ভিসের মাধ্যমে সহজে ও দ্রুত আপনার "${serviceName}" কাজটি সম্পন্ন করুন।`,
    keywords: `${serviceName}, জামানত, Jamanot, অন-ডিমান্ড সার্ভিস, হেল্পার`,
  };
}

export function updateSEOMetadataClient(serviceName?: string) {
  if (typeof window === 'undefined') return;
  const { title, description, keywords } = getSEOMetadataForService(serviceName);

  document.title = title;

  let descMeta = document.querySelector('meta[name="description"]');
  if (!descMeta) {
    descMeta = document.createElement('meta');
    descMeta.setAttribute('name', 'description');
    document.head.appendChild(descMeta);
  }
  descMeta.setAttribute('content', description);

  let ogDescMeta = document.querySelector('meta[property="og:description"]');
  if (ogDescMeta) ogDescMeta.setAttribute('content', description);

  let ogTitleMeta = document.querySelector('meta[property="og:title"]');
  if (ogTitleMeta) ogTitleMeta.setAttribute('content', title);

  let keywordsMeta = document.querySelector('meta[name="keywords"]');
  if (!keywordsMeta) {
    keywordsMeta = document.createElement('meta');
    keywordsMeta.setAttribute('name', 'keywords');
    document.head.appendChild(keywordsMeta);
  }
  keywordsMeta.setAttribute('content', keywords);
}
