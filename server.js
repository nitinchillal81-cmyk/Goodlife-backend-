require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ─── Supabase ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ─── Brevo SMTP ────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS
  }
});

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: '💪 GoodLife Fitness API is running', version: '1.0.0' });
});

// ─── Send Email Helper ─────────────────────────────────────────────────────────
async function sendEmail(to, subject, htmlBody) {
  try {
    await transporter.sendMail({
      from: `"GoodLife Fitness Club" <${process.env.BREVO_SENDER_EMAIL}>`,
      to, subject, html: htmlBody
    });
    return { success: true };
  } catch (err) {
    console.error('Email error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Email Templates ───────────────────────────────────────────────────────────
function welcomeEmailTemplate(name, member_id, plan, end_date) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;padding:30px;border-radius:10px;border:1px solid #ff6b00;">
    <h2 style="color:#ff6b00;">Welcome to GoodLife Fitness Club! 💪</h2>
    <p>Dear <strong>${name}</strong>, you are now a member of the best gym in town!</p>
    <p><strong>Member ID:</strong> <span style="color:#ff6b00;">${member_id}</span></p>
    <p><strong>Plan:</strong> ${plan}</p>
    <p><strong>Valid Till:</strong> ${new Date(end_date).toLocaleDateString('en-IN')}</p>
    <p style="color:#ff6b00;margin-top:20px;">Train hard. Stay consistent. Satish Sir is with you every step!</p>
    <p style="color:#555;font-size:12px;margin-top:20px;">GoodLife Fitness Club by Satish Sir</p>
  </div>`;
}

function offerEmailTemplate(memberName, offer) {
  return `<!DOCTYPE html><html><head><style>
    body{font-family:'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;margin:0;padding:0;}
    .container{max-width:600px;margin:0 auto;background:linear-gradient(135deg,#1a1a1a,#0d0d0d);border:1px solid #ff6b00;border-radius:12px;overflow:hidden;}
    .header{background:linear-gradient(135deg,#ff6b00,#ff4500);padding:30px;text-align:center;}
    .header h1{margin:0;font-size:28px;color:#fff;letter-spacing:2px;}
    .header p{margin:5px 0 0;color:rgba(255,255,255,0.8);font-size:13px;}
    .body{padding:30px;}
    .offer-box{background:rgba(255,107,0,0.1);border:1px solid #ff6b00;border-radius:8px;padding:20px;margin:20px 0;}
    .offer-title{font-size:22px;font-weight:700;color:#ff6b00;margin-bottom:10px;}
    .offer-desc{color:#ccc;line-height:1.7;}
    .validity{display:inline-block;background:#ff6b00;color:#fff;padding:5px 15px;border-radius:20px;font-size:12px;margin-top:10px;}
    .footer{text-align:center;padding:20px;color:#555;font-size:12px;border-top:1px solid #222;}
  </style></head><body>
    <div class="container">
      <div class="header"><h1>💪 GOODLIFE FITNESS</h1><p>by Satish Sir</p></div>
      <div class="body">
        <p style="font-size:18px;color:#ff6b00;">Hey ${memberName}! 🎉</p>
        <p style="color:#aaa;">We have an exclusive offer just for you:</p>
        <div class="offer-box">
          <div class="offer-title">${offer.title}</div>
          <div class="offer-desc">${offer.description}</div>
          ${offer.valid_until ? `<span class="validity">Valid until: ${new Date(offer.valid_until).toLocaleDateString('en-IN')}</span>` : ''}
        </div>
        <p style="color:#888;font-size:13px;">Visit the gym or call us to avail this offer. Limited time only.</p>
      </div>
      <div class="footer">GoodLife Fitness Club by Satish Sir</div>
    </div>
  </body></html>`;
}

function expiryEmailTemplate(memberName, expiryDate, daysLeft) {
  const urgent = daysLeft <= 3;
  const color = urgent ? '#ff2244' : '#ff6b00';
  return `<!DOCTYPE html><html><head><style>
    body{font-family:'Segoe UI',sans-serif;background:#0a0a0a;margin:0;padding:0;}
    .container{max-width:600px;margin:0 auto;background:#1a1a1a;border:1px solid ${color};border-radius:12px;overflow:hidden;}
    .header{background:linear-gradient(135deg,${urgent?'#ff2244,#cc0022':'#ff6b00,#ff4500'});padding:30px;text-align:center;}
    .header h1{margin:0;font-size:26px;color:#fff;}
    .badge{display:inline-block;background:rgba(0,0,0,0.3);color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;margin-top:8px;}
    .body{padding:30px;color:#ddd;}
    .alert-box{background:rgba(255,107,0,0.1);border-left:4px solid ${color};padding:15px 20px;border-radius:4px;margin:20px 0;}
    .days{font-size:48px;font-weight:900;color:${color};line-height:1;}
    .footer{text-align:center;padding:20px;color:#444;font-size:12px;border-top:1px solid #222;}
  </style></head><body>
    <div class="container">
      <div class="header"><h1>💪 GOODLIFE FITNESS</h1><span class="badge">Membership ${urgent?'⚠️ URGENT':'Reminder'}</span></div>
      <div class="body">
        <p>Dear <strong>${memberName}</strong>,</p>
        <div class="alert-box">
          <div class="days">${daysLeft}</div>
          <div style="font-size:14px;color:#888;">days remaining in your membership</div>
        </div>
        <p>Your membership expires on <strong>${new Date(expiryDate).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong>.</p>
        <p>${urgent?'⚡ Act now to avoid any interruption in your fitness journey!':'Renew early to continue your fitness journey without interruption.'}</p>
        <p style="color:#666;font-size:13px;">Contact us at the gym or reach out to Satish Sir directly to renew.</p>
      </div>
      <div class="footer">GoodLife Fitness Club by Satish Sir</div>
    </div>
  </body></html>`;
}

// ══════════════════════════════════════════════════════════════════
// MEMBERS API
// ══════════════════════════════════════════════════════════════════

app.get('/api/members', async (req, res) => {
  const { data, error } = await supabase
    .from('members').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/members', async (req, res) => {
  const { name, email, phone, plan, start_date, end_date, address, dob } = req.body;
  if (!name || !email || !plan || !start_date || !end_date)
    return res.status(400).json({ error: 'Missing required fields: name, email, plan, start_date, end_date' });

  const member_id = `GLF-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data, error } = await supabase
    .from('members')
    .insert([{ member_id, name, email, phone, plan, start_date, end_date, address, dob, status: 'active' }])
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  sendEmail(email, 'Welcome to GoodLife Fitness Club! 🏋️', welcomeEmailTemplate(name, member_id, plan, end_date));
  res.json(data);
});

app.put('/api/members/:id', async (req, res) => {
  const updates = { ...req.body };
  delete updates.member_id;
  delete updates.id;
  const { data, error } = await supabase
    .from('members').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/members/:id', async (req, res) => {
  const { error } = await supabase.from('members').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════
// OFFERS API
// ══════════════════════════════════════════════════════════════════

app.get('/api/offers', async (req, res) => {
  const { data, error } = await supabase
    .from('offers').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/offers', async (req, res) => {
  const { title, description, discount, valid_until, is_active } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Title and description are required' });
  const { data, error } = await supabase
    .from('offers')
    .insert([{ title, description, discount: discount || null, valid_until: valid_until || null, is_active: is_active ?? true }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/offers/:id', async (req, res) => {
  const updates = { ...req.body };
  delete updates.id;
  const { data, error } = await supabase
    .from('offers').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/offers/:id', async (req, res) => {
  const { error } = await supabase.from('offers').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════
// STATS API
// ══════════════════════════════════════════════════════════════════

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
  res.json({ total: t.count ?? 0, active: a.count ?? 0, expired: e.count ?? 0, expiringSoon: s.count ?? 0 });
});

// ══════════════════════════════════════════════════════════════════
// EMAIL BROADCAST API
// ══════════════════════════════════════════════════════════════════

app.post('/api/broadcast/offer', async (req, res) => {
  const { offer_id, member_ids } = req.body;
  if (!offer_id) return res.status(400).json({ error: 'offer_id is required' });
  const { data: offer } = await supabase.from('offers').select('*').eq('id', offer_id).single();
  if (!offer) return res.status(404).json({ error: 'Offer not found' });
  let query = supabase.from('members').select('name, email').eq('status', 'active');
  if (member_ids && member_ids.length > 0) query = query.in('id', member_ids);
  const { data: members } = await query;
  if (!members || members.length === 0) return res.status(404).json({ error: 'No active members found' });
  const results = await Promise.all(
    members.map(m => sendEmail(m.email, `🔥 Special Offer: ${offer.title} - GoodLife Fitness`, offerEmailTemplate(m.name, offer)))
  );
  res.json({ success: true, sent: results.filter(r => r.success).length, total: members.length });
});

app.post('/api/broadcast/expiry-check', async (req, res) => {
  const result = await runExpiryCheck();
  res.json(result);
});

// ─── Shared expiry check logic ─────────────────────────────────────────────────
async function runExpiryCheck() {
  const today = new Date();
  const in7 = new Date(today); in7.setDate(today.getDate() + 7);
  const format = d => d.toISOString().split('T')[0];

  const { data: members } = await supabase
    .from('members').select('name, email, end_date')
    .eq('status', 'active')
    .gte('end_date', format(today))
    .lte('end_date', format(in7));

  let sent = 0;
  if (members && members.length > 0) {
    const results = await Promise.all(
      members.map(m => {
        const diff = Math.ceil((new Date(m.end_date) - today) / 86400000);
        return sendEmail(
          m.email,
          `⏰ Your GoodLife Membership Expires in ${diff} Day${diff !== 1 ? 's' : ''}!`,
          expiryEmailTemplate(m.name, m.end_date, diff)
        );
      })
    );
    sent = results.filter(r => r.success).length;
  }

  // Auto-mark expired memberships
  await supabase.from('members').update({ status: 'expired' })
    .lt('end_date', format(today)).eq('status', 'active');

  return { success: true, sent, total: members?.length ?? 0 };
}

// ─── Cron: Daily at 9 AM ───────────────────────────────────────────────────────
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Running daily expiry check...');
  try {
    const result = await runExpiryCheck();
    console.log(`✅ Done — sent ${result.sent} expiry alerts`);
  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n💪 GoodLife Fitness API running on port ${PORT}\n`);
});
