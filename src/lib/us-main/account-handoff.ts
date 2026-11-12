'use client';
import {useUserStore, type PurchasedBundle, type UnlockedFeatures} from '@/lib/user-store';
import {useOnboardingStore as sharedOnboarding} from '@/lib/onboarding-store';
import {useOnboardingStore} from './onboarding-store';
// Only call after successful server-authenticated registration. Checkout state stays US-only.
export function enterPurchasedAccount(user:{id:string;email:string;coins:number;unlockedFeatures:Partial<UnlockedFeatures>;bundlePurchased:PurchasedBundle}) {
 const store=useUserStore.getState();
 store.resetUserState();
 store.setUserId(user.id);
 store.syncFromServer({coins:user.coins,unlockedFeatures:user.unlockedFeatures,purchasedBundle:user.bundlePurchased});
 const {setState}=sharedOnboarding;
 const data=useOnboardingStore.getState();
 const fields=Object.fromEntries(Object.entries(data).filter(([,value])=>typeof value!=='function'));
 setState(fields);
 localStorage.setItem('astrorekha_user_id',user.id);
 localStorage.setItem('astrorekha_email',user.email);
 localStorage.setItem('astrorekha_registration_completed','true');
 // Report screens use the existing account, not a separate set of report entitlements.
 const palm=localStorage.getItem('astrorekha_us_main_palm_image');
 if(palm)localStorage.setItem('astrorekha_palm_image',palm);
}
