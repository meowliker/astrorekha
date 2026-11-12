export async function accountWesternSigns(): Promise<{sun:string;moon:string|null;ascendant:string|null}|null> {
 const r=await fetch("/api/account/zodiac",{cache:"no-store"});
 if(r.status===401)throw new Error("Please sign in to load your saved birth details.");
 const d=await r.json();
 if(!r.ok)throw new Error(d.error || "Unable to calculate your signs");
 return d.western ? d : null;
}
