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
  origin: '*', // Allow all origins (Vercel frontend + local dev)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'GoodLife Fitness API is running 💪' });
});

// ─── Supabase Client ───────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ─── Brevo (formerly Sendinblue) Email Transporter ────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS
  }
});

// ─── Helper: Send Email ────────────────────────────────────────────────────────
async function sendEmail(to, subject, htmlBody) {
  try {
    await transporter.sendMail({
      from: `"GoodLife Fitness Club" <${process.env.BREVO_SENDER_EMAIL}>`,
      to,
      subject,
      html: htmlBody
    });
    return { success: true };
  } catch (err) {
    console.error('Email error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Email Templates ───────────────────────────────────────────────────────────
function offerEmailTemplate(memberName, offer) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #fff; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a, #0d0d0d); border: 1px solid #ff6b00; border-radius: 12px; overflow: hidden; }
      .header { background: linear-gradient(135deg, #ff6b00, #ff4500); padding: 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 28px; color: #fff; letter-spacing: 2px; }
      .header p { margin: 5px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
      .body { padding: 30px; }
      .greeting { font-size: 18px; color: #ff6b00; margin-bottom: 15px; }
      .offer-box { background: rgba(255,107,0,0.1); border: 1px solid #ff6b00; border-radius: 8px; padding: 20px; margin: 20px 0; }
      .offer-title { font-size: 22px; font-weight: 700; color: #ff6b00; margin-bottom: 10px; }
      .offer-desc { color: #ccc; line-height: 1.7; }
      .validity { display: inline-block; background: #ff6b00; color: #fff; padding: 5px 15px; border-radius: 20px; font-size: 12px; margin-top: 10px; }
      .cta { text-align: center; margin: 25px 0; }
      .cta a { background: linear-gradient(135deg, #ff6b00, #ff4500); color: #fff; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 15px; }
      .footer { text-align: center; padding: 20px; color: #555; font-size: 12px; border-top: 1px solid #222; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>💪 GOODLIFE FITNESS</h1>
        <p>by Satish Sir</p>
      </div>
      <div class="body">
        <div class="greeting">Hey ${memberName}! 🎉</div>
        <p style="color:#aaa;">We have an exclusive offer just for you:</p>
        <div class="offer-box">
          <div class="offer-title">${offer.title}</div>
          <div class="offer-desc">${offer.description}</div>
          ${offer.valid_until ? `<span class="validity">Valid until: ${new Date(offer.valid_until).toLocaleDateString('en-IN')}</span>` : ''}
        </div>
        <div class="cta">
          <a href="#">Claim This Offer Now</a>
        </div>
        <p style="color:#888;font-size:13px;">Don't miss out! Visit the gym or call us to avail this offer. Limited time only.</p>
      </div>
      <div class="footer">
        GoodLife Fitness Club by Satish Sir | Unsubscribe anytime
      </div>
    </div>
  </body>
  </html>`;
}

function expiryEmailTemplate(memberName, expiryDate, daysLeft) {
  const urgent = daysLeft <= 3;
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; background: #1a1a1a; border: 1px solid ${urgent ? '#ff2244' : '#ff6b00'}; border-radius: 12px; overflow: hidden; }
      .header { background: linear-gradient(135deg, ${urgent ? '#ff2244, #cc0022' : '#ff6b00, #ff4500'}); padding: 30px; text-align: center; }
      .header h1 { margin: 0; font-size: 26px; color: #fff; }
      .badge { display: inline-block; background: rgba(0,0,0,0.3); color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 12px; margin-top: 8px; }
      .body { padding: 30px; color: #ddd; }
      .alert-box { background: rgba(${urgent ? '255,34,68' : '255,107,0'},0.1); border-left: 4px solid ${urgent ? '#ff2244' : '#ff6b00'}; padding: 15px 20px; border-radius: 4px; margin: 20px 0; }
      .days { font-size: 48px; font-weight: 900; color: ${urgent ? '#ff2244' : '#ff6b00'}; line-height: 1; }
      .days-label { font-size: 14px; color: #888; }
      .cta a { background: ${urgent ? '#ff2244' : '#ff6b00'}; color: #fff; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: 700; display: inline-block; }
      .footer { text-align: center; padding: 20px; color: #444; font-size: 12px; border-top: 1px solid #222; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>💪 GOODLIFE FITNESS</h1>
        <span class="badge">Membership ${urgent ? '⚠️ URGENT' : 'Reminder'}</span>
      </div>
      <div class="body">
        <p>Dear <strong>${memberName}</strong>,</p>
        <div class="alert-box">
          <div class="days">${daysLeft}</div>
          <div class="days-label">days remaining in your membership</div>
        </div>
        <p>Your membership expires on <strong>${new Date(expiryDate).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.</p>
        <p>${urgent ? '⚡ Act now to avoid any interruption in your fitness journey!' : 'Renew early to continue your fitness journey without interruption.'}</p>
        <div style="text-align:center;margin:25px 0;">
          <a href="#" style="background:${urgent ? '#ff2244' : '#ff6b00'};color:#fff;padding:14px 35px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">Renew Membership Now</a>
        </div>
        <p style="color:#666;font-size:13px;">Contact us at the gym or reach out to Satish Sir directly to renew your membership.</p>
      </div>
      <div class="footer">GoodLife Fitness Club by Satish Sir</div>
    </div>
  </body>
  </html>`;
}

// ─── MEMBERS API ───────────────────────────────────────────────────────────────
app.get('/api/members', async (req, res) => {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/members', async (req, res) => {
  const { name, email, phone, plan, start_date, end_date, address, dob } = req.body;
  if (!name || !email || !plan || !start_date || !end_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  // Generate member ID: GLF-YYYY-XXXX
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  const member_id = `GLF-${year}-${rand}`;

  const { data, error } = await supabase
    .from('members')
    .insert([{ member_id, name, email, phone, plan, start_date, end_date, address, dob, status: 'active' }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Send welcome email
  const welcome = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;padding:30px;border-radius:10px;border:1px solid #ff6b00;">
      <h2 style="color:#ff6b00;">Welcome to GoodLife Fitness Club! 💪</h2>
      <p>Dear <strong>${name}</strong>, you're now a member of the best gym in town!</p>
      <p><strong>Member ID:</strong> ${member_id}</p>
      <p><strong>Plan:</strong> ${plan}</p>
      <p><strong>Valid Till:</strong> ${new Date(end_date).toLocaleDateString('en-IN')}</p>
      <p style="color:#ff6b00;">Train hard. Stay consistent. Satish Sir is with you every step!</p>
    </div>`;
  await sendEmail(email, 'Welcome to GoodLife Fitness Club! 🏋️', welcome);

  res.json(data);
});

app.put('/api/members/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  delete updates.member_id; // Don't allow changing member_id
  const { data, error } = await supabase
    .from('members')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/members/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('members').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── OFFERS API ────────────────────────────────────────────────────────────────
app.get('/api/offers', async (req, res) => {
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/offers', async (req, res) => {
  const { title, description, discount, valid_until, is_active } = req.body;
  const { data, error } = await supabase
    .from('offers')
    .insert([{ title, description, discount, valid_until, is_active: is_active ?? true }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/offers/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('offers')
    .update(req.body)
    .eq('id', id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/offers/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('offers').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── EMAIL BROADCAST API ───────────────────────────────────────────────────────
app.post('/api/broadcast/offer', async (req, res) => {
  const { offer_id, member_ids } = req.body; // member_ids = null means all members

  const { data: offer } = await supabase.from('offers').select('*').eq('id', offer_id).single();
  if (!offer) return res.status(404).json({ error: 'Offer not found' });

  let query = supabase.from('members').select('name, email').eq('status', 'active');
  if (member_ids && member_ids.length > 0) {
    query = query.in('id', member_ids);
  }

  const { data: members } = await query;
  if (!members || members.length === 0) return res.status(404).json({ error: 'No members found' });

  const results = await Promise.all(
    members.map(m => sendEmail(m.email, `🔥 Special Offer: ${offer.title} - GoodLife Fitness`, offerEmailTemplate(m.name, offer)))
  );

  const sent = results.filter(r => r.success).length;
  res.json({ success: true, sent, total: members.length });
});

app.post('/api/broadcast/expiry-check', async (req, res) => {
  // Manual trigger - also called by cron
  const today = new Date();
  const in7 = new Date(today); in7.setDate(today.getDate() + 7);
  const in3 = new Date(today); in3.setDate(today.getDate() + 3);
  const in1 = new Date(today); in1.setDate(today.getDate() + 1);

  const format = d => d.toISOString().split('T')[0];

  const { data: members } = await supabase
    .from('members')
    .select('name, email, end_date')
    .eq('status', 'active')
    .gte('end_date', format(today))
    .lte('end_date', format(in7));

  if (!members || members.length === 0) return res.json({ success: true, sent: 0 });

  const results = await Promise.all(
    members.map(m => {
      const exp = new Date(m.end_date);
      const diff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
      return sendEmail(
        m.email,
        `⏰ Your GoodLife Membership Expires in ${diff} Day${diff > 1 ? 's' : ''}!`,
        expiryEmailTemplate(m.name, m.end_date, diff)
      );
    })
  );

  const sent = results.filter(r => r.success).length;
  res.json({ success: true, sent, total: members.length });
});

// ─── STATS API ─────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const { count: total } = await supabase.from('members').select('*', { count: 'exact', head: true });
  const { count: active } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: expired } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'expired');

  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(); in7.setDate(in7.getDate() + 7);
  const { count: expiringSoon } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .gte('end_date', today)
    .lte('end_date', in7.toISOString().split('T')[0]);

  res.json({ total, active, expired, expiringSoon });
});



// ─── Cron: Daily Expiry Check at 9 AM ─────────────────────────────────────────
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Running daily membership expiry check...');
  try {
    const today = new Date();
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);
    const format = d => d.toISOString().split('T')[0];
    const { data: members } = await supabase
      .from('members')
      .select('name, email, end_date')
      .eq('status', 'active')
      .gte('end_date', format(today))
      .lte('end_date', format(in7));
    if (members && members.length > 0) {
      for (const m of members) {
        const exp = new Date(m.end_date);
        const diff = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
        await sendEmail(m.email, `⏰ Membership Expires in ${diff} Day${diff > 1 ? 's' : ''}!`, expiryEmailTemplate(m.name, m.end_date, diff));
      }
      console.log(`✅ Sent ${members.length} expiry alerts`);
    }

    // Also mark expired memberships
    await supabase
      .from('members')
      .update({ status: 'expired' })
      .lt('end_date', format(today))
      .eq('status', 'active');
  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`\n💪 GoodLife Fitness Server running on port ${PORT}`);
  console.log(`   User Site: http://localhost:${PORT}`);
  console.log(`   Admin Panel: http://localhost:${PORT}/admin\n`);
});
