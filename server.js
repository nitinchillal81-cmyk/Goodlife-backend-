require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// ── Supabase ───────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── Health Check ───────────────────────────────────────
app.get('/', (req, res) => res.json({ status: '💪 GoodLife Fitness API is running', version: '1.0.0' }));

// ── Send Email via Brevo API (NOT SMTP) ───────────────
async function sendEmail(to, toName, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderRaw = process.env.BREVO_SENDER_EMAIL || 'GoodLife Fitness <noreply@goodlife.com>';

  let senderName = 'GoodLife Fitness', senderEmail = senderRaw;
  const match = senderRaw.match(/^(.+)<(.+)>$/);
  if (match) { senderName = match[1].trim(); senderEmail = match[2].trim(); }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent
      })
    });
    const data = await res.json();
    if (res.ok) return { success: true, messageId: data.messageId };
    console.error('Brevo error:', data.message);
    return { success: false, error: data.message };
  } catch (err) {
    console.error('Email send error:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Email Templates ────────────────────────────────────
function welcomeHtml(name, member_id, plan, end_date) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;padding:30px;border-radius:10px;border:1px solid #ff6b00;">
    <h2 style="color:#ff6b00;">Welcome to GoodLife Fitness Club! 💪</h2>
    <p>Dear <strong>${name}</strong>, you are now an official member!</p>
    <table style="margin:20px 0;width:100%;border-collapse:collapse;">
      <tr><td style="padding:10px;background:#1a1a1a;border-radius:6px 6px 0 0;color:#888;font-size:12px;letter-spacing:1px;">MEMBER ID</td><td style="padding:10px;background:#1a1a1a;border-radius:6px 6px 0 0;color:#ff6b00;font-family:monospace;font-weight:700;">${member_id}</td></tr>
      <tr><td style="padding:10px;background:#131313;color:#888;font-size:12px;">PLAN</td><td style="padding:10px;background:#131313;color:#fff;">${plan}</td></tr>
      <tr><td style="padding:10px;background:#1a1a1a;border-radius:0 0 6px 6px;color:#888;font-size:12px;">VALID TILL</td><td style="padding:10px;background:#1a1a1a;border-radius:0 0 6px 6px;color:#10b981;">${new Date(end_date).toLocaleDateString('en-IN')}</td></tr>
    </table>
    <p style="color:#ff6b00;margin-top:20px;font-style:italic;">"Train hard. Stay consistent. I'm with you every step!" — Satish Sir</p>
    <p style="color:#444;font-size:12px;margin-top:20px;">GoodLife Fitness Club by Satish Sir</p>
  </div>`;
}

function offerHtml(memberName, offer) {
  return `<!DOCTYPE html><html><head><style>
    body{font-family:'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:0;}
    .wrap{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#1a1a1a,#0d0d0d);border:1px solid #ff6b00;border-radius:12px;overflow:hidden;}
    .hdr{background:linear-gradient(135deg,#ff6b00,#ff4500);padding:28px;text-align:center;}
    .hdr h1{margin:0;font-size:26px;color:#fff;letter-spacing:2px;}
    .hdr p{margin:5px 0 0;color:rgba(255,255,255,.8);font-size:13px;}
    .body{padding:28px;}
    .ob{background:rgba(255,107,0,.08);border:1px solid #ff6b00;border-radius:8px;padding:20px;margin:18px 0;}
    .ot{font-size:20px;font-weight:700;color:#ff6b00;margin-bottom:8px;}
    .od{color:#ccc;line-height:1.7;}
    .vl{display:inline-block;background:#ff6b00;color:#fff;padding:5px 15px;border-radius:20px;font-size:12px;margin-top:10px;}
    .ft{text-align:center;padding:18px;color:#555;font-size:12px;border-top:1px solid #222;}
  </style></head><body>
  <div class="wrap">
    <div class="hdr"><h1>💪 GOODLIFE FITNESS</h1><p>by Satish Sir</p></div>
    <div class="body">
      <p style="font-size:18px;color:#ff6b00;">Hey ${memberName}! 🎉</p>
      <p style="color:#aaa;">Exclusive offer just for you:</p>
      <div class="ob">
        <div class="ot">${offer.title}</div>
        <div class="od">${offer.description}</div>
        ${offer.discount ? `<div style="font-family:monospace;font-size:28px;color:#10b981;margin-top:10px;">${offer.discount}% OFF</div>` : ''}
        ${offer.valid_until ? `<span class="vl">Valid until: ${new Date(offer.valid_until).toLocaleDateString('en-IN')}</span>` : ''}
      </div>
      <p style="color:#888;font-size:13px;">Visit the gym or call us to avail this offer. Limited time only!</p>
    </div>
    <div class="ft">GoodLife Fitness Club by Satish Sir</div>
  </div></body></html>`;
}

function expiryHtml(memberName, expiryDate, daysLeft) {
  const urgent = daysLeft <= 3;
  const col = urgent ? '#ef4444' : '#ff6b00';
  return `<!DOCTYPE html><html><head><style>
    body{font-family:'Segoe UI',sans-serif;background:#0a0a0a;margin:0;padding:0;}
    .wrap{max-width:600px;margin:0 auto;background:#1a1a1a;border:1px solid ${col};border-radius:12px;overflow:hidden;}
    .hdr{background:linear-gradient(135deg,${urgent?'#ef4444,#cc0000':'#ff6b00,#ff4500'});padding:28px;text-align:center;}
    .hdr h1{margin:0;font-size:24px;color:#fff;}
    .bdg{display:inline-block;background:rgba(0,0,0,.3);color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;margin-top:8px;}
    .body{padding:28px;color:#ddd;}
    .ab{background:rgba(255,107,0,.08);border-left:4px solid ${col};padding:16px 20px;border-radius:4px;margin:18px 0;}
    .days{font-size:52px;font-weight:900;color:${col};line-height:1;}
    .ft{text-align:center;padding:18px;color:#444;font-size:12px;border-top:1px solid #222;}
  </style></head><body>
  <div class="wrap">
    <div class="hdr"><h1>💪 GOODLIFE FITNESS</h1><span class="bdg">${urgent ? '⚠️ URGENT' : '⏰ Reminder'}</span></div>
    <div class="body">
      <p>Dear <strong>${memberName}</strong>,</p>
      <div class="ab"><div class="days">${daysLeft}</div><div style="font-size:14px;color:#888;">days remaining in your membership</div></div>
      <p>Your membership expires on <strong>${new Date(expiryDate).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong>.</p>
      <p>${urgent ? '⚡ <strong>Act now</strong> to avoid interruption in your fitness journey!' : 'Renew early to continue without interruption.'}</p>
      <p style="color:#666;font-size:13px;margin-top:16px;">Contact Satish Sir directly or visit the gym to renew.</p>
    </div>
    <div class="ft">GoodLife Fitness Club by Satish Sir</div>
  </div></body></html>`;
}

// ══════════════════════════════════════════════════════
// MEMBERS API
// ══════════════════════════════════════════════════════
app.get('/api/members', async (req, res) => {
  const { data, error } = await supabase.from('members').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/members', async (req, res) => {
  const { name, email, phone, plan, start_date, end_date, address, dob } = req.body;
  if (!name || !email || !plan || !start_date || !end_date)
    return res.status(400).json({ error: 'Missing required fields' });

  const member_id = `GLF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data, error } = await supabase
    .from('members')
    .insert([{ member_id, name, email, phone, plan, start_date, end_date, address, dob, status: 'active' }])
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  sendEmail(email, name, 'Welcome to GoodLife Fitness Club! 🏋️', welcomeHtml(name, member_id, plan, end_date));
  res.json(data);
});

app.put('/api/members/:id', async (req, res) => {
  const updates = { ...req.body }; delete updates.member_id; delete updates.id;
  const { data, error } = await supabase.from('members').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/members/:id', async (req, res) => {
  const { error } = await supabase.from('members').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════
// OFFERS API
// ══════════════════════════════════════════════════════
app.get('/api/offers', async (req, res) => {
  const { data, error } = await supabase.from('offers').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/offers', async (req, res) => {
  const { title, description, discount, valid_until, is_active, tag } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
  const { data, error } = await supabase
    .from('offers')
    .insert([{ title, description, discount: discount||null, valid_until: valid_until||null, is_active: is_active??true, tag: tag||null }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/offers/:id', async (req, res) => {
  const updates = { ...req.body }; delete updates.id;
  const { data, error } = await supabase.from('offers').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/offers/:id', async (req, res) => {
  const { error } = await supabase.from('offers').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════
// STATS API
// ══════════════════════════════════════════════════════
app.get('/api/stats', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const [t, a, e, s] = await Promise.all([
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
    supabase.from('members').select('*', { count: 'exact', head: true })
      .gte('end_date', today).lte('end_date', in7.toISOString().split('T')[0])
  ]);
  res.json({ total: t.count??0, active: a.count??0, expired: e.count??0, expiringSoon: s.count??0 });
});

// ══════════════════════════════════════════════════════
// BROADCAST API
// ══════════════════════════════════════════════════════
app.post('/api/broadcast/offer', async (req, res) => {
  const { offer_id, member_ids } = req.body;
  if (!offer_id) return res.status(400).json({ error: 'offer_id required' });
  const { data: offer } = await supabase.from('offers').select('*').eq('id', offer_id).single();
  if (!offer) return res.status(404).json({ error: 'Offer not found' });
  let q = supabase.from('members').select('name, email').eq('status', 'active');
  if (member_ids?.length) q = q.in('id', member_ids);
  const { data: members } = await q;
  if (!members?.length) return res.status(404).json({ error: 'No active members' });
  const results = await Promise.all(members.map(m =>
    sendEmail(m.email, m.name, `🔥 Special Offer: ${offer.title} — GoodLife Fitness`, offerHtml(m.name, offer))
  ));
  res.json({ success: true, sent: results.filter(r => r.success).length, total: members.length });
});

app.post('/api/broadcast/expiry-check', async (req, res) => {
  const result = await runExpiry();
  res.json(result);
});

// ── Shared expiry logic ────────────────────────────────
async function runExpiry() {
  const today = new Date();
  const in7 = new Date(today); in7.setDate(today.getDate() + 7);
  const fmt = d => d.toISOString().split('T')[0];

  const { data: members } = await supabase.from('members').select('name, email, end_date')
    .eq('status', 'active').gte('end_date', fmt(today)).lte('end_date', fmt(in7));

  let sent = 0;
  if (members?.length) {
    const results = await Promise.all(members.map(m => {
      const diff = Math.ceil((new Date(m.end_date) - today) / 86400000);
      return sendEmail(m.email, m.name,
        `⏰ Your Membership Expires in ${diff} Day${diff!==1?'s':''}! — GoodLife Fitness`,
        expiryHtml(m.name, m.end_date, diff));
    }));
    sent = results.filter(r => r.success).length;
  }
  await supabase.from('members').update({ status: 'expired' })
    .lt('end_date', fmt(today)).eq('status', 'active');
  return { success: true, sent, total: members?.length ?? 0 };
}

// ── Daily Cron at 9 AM ─────────────────────────────────
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Daily expiry check running...');
  const r = await runExpiry();
  console.log(`✅ Done — sent ${r.sent} alerts`);
});

// ── Start ──────────────────────────────────────────────
app.listen(PORT, () => console.log(`\n💪 GoodLife Fitness API on port ${PORT}\n`));
