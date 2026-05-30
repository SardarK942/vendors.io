import fs from 'node:fs/promises';
import path from 'node:path';
import { createServiceRoleClient } from '../../src/lib/supabase/server';
import { mintTokenString, hashTokenString } from './lib/claim-token';

interface Args {
  campaign: string;
  filter: string;
  ttlDays: number;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  if (!args.campaign) throw new Error('--campaign required');
  if (!args.filter) throw new Error('--filter required (SQL WHERE fragment)');
  return {
    campaign: args.campaign,
    filter: args.filter,
    ttlDays: Number(args['ttl-days'] ?? '90'),
  };
}

async function main() {
  const { campaign, filter, ttlDays } = parseArgs(process.argv.slice(2));
  const supabase = await createServiceRoleClient();

  const { data: vendors, error } = await supabase.rpc('select_scraped_vendors_for_mint', {
    p_where: filter,
  });
  if (error) throw error;
  if (!vendors || vendors.length === 0) {
    console.log('no vendors matched');
    return;
  }

  const expiresAt = new Date(Date.now() + ttlDays * 86400_000).toISOString();
  const csvRows = ['scraped_vendor_id,business_name,instagram_handle,claim_url,campaign'];
  let minted = 0;
  for (const v of vendors as Array<{
    id: string;
    business_name: string;
    instagram_handle: string | null;
  }>) {
    const token = mintTokenString(v.id);
    const hash = hashTokenString(token);
    const { error: insErr } = await supabase.from('claim_tokens').insert({
      scraped_vendor_id: v.id,
      token_hash: hash,
      expires_at: expiresAt,
      campaign_label: campaign,
    });
    if (insErr) {
      console.warn(`skip ${v.id}: ${insErr.message}`);
      continue;
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const claimUrl = `${appUrl}/claim/${token}`;
    csvRows.push(
      [v.id, JSON.stringify(v.business_name), v.instagram_handle ?? '', claimUrl, campaign].join(
        ','
      )
    );
    minted++;
  }

  const outFile = path.join(process.cwd(), `mint-tokens-${campaign}.csv`);
  await fs.writeFile(outFile, csvRows.join('\n'));
  console.log(`minted ${minted} tokens; wrote ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
