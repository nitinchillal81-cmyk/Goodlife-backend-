require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// ── Supabase ───────────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── Health Check ───────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: '💪 GoodLife Fitness API is running', version: '1.0.0' }));

// ══════════════════════════════════════════════════════════════
// BREVO EMAIL  — called by server only, key stays server-side
// ══════════════════════════════════════════════════════════════
async function sendEmail(to, toName, subject, htmlContent) {
  const apiKey  = process.env.BREVO_API_KEY;
  const rawSender = process.env.BREVO_SENDER_EMAIL || 'GoodLife Fitness <noreply@goodlife.com>';

  if (!apiKey) {
    console.warn('⚠️  BREVO_API_KEY not set — email skipped');
    return { success: false, error: 'BREVO_API_KEY not configured on server' };
  }

  let senderName = 'GoodLife Fitness', senderEmail = rawSender;
  const m = rawSender.match(/^(.+)<(.+)>$/);
  if (m) { senderName = m[1].trim(); senderEmail = m[2].trim(); }

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
    if (res.ok) { console.log(`✅ Email sent → ${to}`); return { success: true }; }
    console.error(`❌ Brevo error: ${data.message}`);
    return { success: false, error: data.message };
  } catch (err) {
    console.error('❌ Email send failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ── Email Templates ────────────────────────────────────────────
function welcomeHtml(name, member_id, plan, end_date) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;padding:0;border-radius:12px;overflow:hidden;border:1px solid #ff6b00;">
    <div style="background:linear-gradient(135deg,#ff6b00,#ff4500);padding:28px;text-align:center;">
      <h1 style="margin:0;font-size:28px;letter-spacing:3px;color:#fff;">💪 GOODLIFE FITNESS</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">by Satish Sir</p>
    </div>
    <div style="padding:30px;">
      <h2 style="color:#ff6b00;margin-bottom:6px;">Welcome to the Family, ${name}! 🎉</h2>
      <p style="color:#aaa;margin-bottom:22px;">Your membership has been activated. Here are your details:</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr><td style="padding:12px 14px;background:#1a1a1a;color:#888;font-size:12px;letter-spacing:1px;border-radius:6px 6px 0 0;border-bottom:1px solid #222;">MEMBER ID</td>
            <td style="padding:12px 14px;background:#1a1a1a;color:#ff6b00;font-family:monospace;font-size:16px;font-weight:700;">${member_id}</td></tr>
        <tr><td style="padding:12px 14px;background:#141414;color:#888;font-size:12px;border-bottom:1px solid #222;">PLAN</td>
            <td style="padding:12px 14px;background:#141414;color:#fff;">${plan}</td></tr>
        <tr><td style="padding:12px 14px;background:#1a1a1a;color:#888;font-size:12px;border-radius:0 0 6px 6px;">VALID TILL</td>
            <td style="padding:12px 14px;background:#1a1a1a;color:#10b981;font-weight:700;">${new Date(end_date).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
      </table>
      <p style="color:#ccc;font-size:14px;line-height:1.7;">Save this email — your <strong>Member ID</strong> is required to log in to your member account on our website.</p>
      <p style="color:#ff6b00;font-style:italic;margin-top:18px;font-size:15px;">"Train hard. Stay consistent. I'm with you every step!" — Satish Sir</p>
    </div>
    <div style="text-align:center;padding:18px;color:#555;font-size:12px;border-top:1px solid #222;">GoodLife Fitness Club by Satish Sir</div>
  </div>`;
}

function extensionHtml(name, member_id, plan, end_date) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;padding:0;border-radius:12px;overflow:hidden;border:1px solid #10b981;">
    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:28px;text-align:center;">
      <h1 style="margin:0;font-size:26px;letter-spacing:2px;color:#fff;">💪 GOODLIFE FITNESS</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Membership Renewed ✅</p>
    </div>
    <div style="padding:30px;">
      <h2 style="color:#10b981;margin-bottom:6px;">Membership Extended, ${name}! 🎉</h2>
      <p style="color:#aaa;margin-bottom:22px;">Your membership has been successfully renewed. Keep up the great work!</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr><td style="padding:12px 14px;background:#1a1a1a;color:#888;font-size:12px;border-radius:6px 6px 0 0;border-bottom:1px solid #222;">MEMBER ID</td>
            <td style="padding:12px 14px;background:#1a1a1a;color:#ff6b00;font-family:monospace;font-size:16px;font-weight:700;">${member_id}</td></tr>
        <tr><td style="padding:12px 14px;background:#141414;color:#888;font-size:12px;border-bottom:1px solid #222;">NEW PLAN</td>
            <td style="padding:12px 14px;background:#141414;color:#fff;">${plan}</td></tr>
        <tr><td style="padding:12px 14px;background:#1a1a1a;color:#888;font-size:12px;border-radius:0 0 6px 6px;">NEW EXPIRY</td>
            <td style="padding:12px 14px;background:#1a1a1a;color:#10b981;font-weight:700;">${new Date(end_date).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</td></tr>
      </table>
      <p style="color:#ff6b00;font-style:italic;font-size:15px;">"Consistency is the key — see you at the gym!" — Satish Sir</p>
    </div>
    <div style="text-align:center;padding:18px;color:#555;font-size:12px;border-top:1px solid #222;">GoodLife Fitness Club by Satish Sir</div>
  </div>`;
}

function offerHtml(memberName, offer, expiryOverride) {
  const expDate = expiryOverride || offer.valid_until;
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;border-radius:12px;overflow:hidden;border:1px solid #ff6b00;">
    <div style="background:linear-gradient(135deg,#ff6b00,#ff4500);padding:28px;text-align:center;">
      <h1 style="margin:0;font-size:26px;letter-spacing:2px;color:#fff;">💪 GOODLIFE FITNESS</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px;">by Satish Sir</p>
    </div>
    <div style="padding:28px;">
      <p style="font-size:18px;color:#ff6b00;margin-bottom:8px;">Hey ${memberName}! 🎉</p>
      <div style="background:rgba(255,107,0,.08);border:1px solid #ff6b00;border-radius:8px;padding:20px;margin:16px 0;">
        ${offer.discount ? `<div style="font-size:32px;font-weight:900;color:#10b981;margin-bottom:10px;font-family:monospace;">${offer.discount}% OFF</div>` : ''}
        <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px;">${offer.title}</div>
        <div style="color:#ccc;line-height:1.7;font-size:14px;">${offer.description}</div>
        ${expDate ? `<div style="display:inline-block;background:#ff6b00;color:#fff;padding:5px 15px;border-radius:20px;font-size:12px;margin-top:12px;">📅 Valid until: ${new Date(expDate).toLocaleDateString('en-IN')}</div>` : ''}
      </div>
      <p style="color:#888;font-size:13px;">Visit the gym or call us to avail this offer!</p>
    </div>
    <div style="text-align:center;padding:18px;color:#555;font-size:12px;border-top:1px solid #222;">GoodLife Fitness Club by Satish Sir</div>
  </div>`;
}

function customHtml(memberName, body) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;border-radius:12px;overflow:hidden;border:1px solid #ff6b00;">
    <div style="background:linear-gradient(135deg,#ff6b00,#ff4500);padding:24px;text-align:center;">
      <h1 style="margin:0;font-size:24px;letter-spacing:2px;color:#fff;">💪 GOODLIFE FITNESS</h1>
    </div>
    <div style="padding:28px;">
      <p style="color:#ff6b00;font-size:16px;margin-bottom:16px;">Dear ${memberName},</p>
      <div style="background:#1a1a1a;border-radius:8px;padding:20px;line-height:1.8;color:#ddd;font-size:14px;white-space:pre-wrap;">${body}</div>
      <p style="color:#888;font-size:13px;margin-top:20px;">— Satish Sir, GoodLife Fitness Club</p>
    </div>
    <div style="text-align:center;padding:18px;color:#555;font-size:12px;border-top:1px solid #222;">GoodLife Fitness Club by Satish Sir</div>
  </div>`;
}

function expiryHtml(memberName, expiryDate, daysLeft, customMsg) {
  const urgent = daysLeft <= 3;
  const col = urgent ? '#ef4444' : '#ff6b00';
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#1a1a1a;border:1px solid ${col};border-radius:12px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,${urgent?'#ef4444,#cc0000':'#ff6b00,#ff4500'});padding:28px;text-align:center;">
      <h1 style="margin:0;font-size:24px;color:#fff;">💪 GOODLIFE FITNESS</h1>
      <span style="display:inline-block;background:rgba(0,0,0,.3);color:#fff;padding:4px 14px;border-radius:20px;font-size:12px;margin-top:8px;">${urgent ? '⚠️ URGENT' : '⏰ Reminder'}</span>
    </div>
    <div style="padding:28px;color:#ddd;">
      <p>Dear <strong>${memberName}</strong>,</p>
      <div style="background:rgba(255,107,0,.08);border-left:4px solid ${col};padding:16px 20px;border-radius:4px;margin:18px 0;">
        <div style="font-size:52px;font-weight:900;color:${col};line-height:1;">${daysLeft}</div>
        <div style="font-size:14px;color:#888;">days remaining in your membership</div>
      </div>
      <p>Expires on <strong>${new Date(expiryDate).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong>.</p>
      ${customMsg ? `<p style="background:rgba(255,107,0,.08);border:1px solid rgba(255,107,0,.3);border-radius:6px;padding:12px 16px;margin-top:14px;color:#ff6b00;font-weight:700;">🎁 ${customMsg}</p>` : ''}
      <p style="color:#666;font-size:13px;margin-top:16px;">Contact Satish Sir or visit the gym to renew.</p>
    </div>
    <div style="text-align:center;padding:18px;color:#444;font-size:12px;border-top:1px solid #222;">GoodLife Fitness Club by Satish Sir</div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════
// MEMBERS API
// ══════════════════════════════════════════════════════════════
app.get('/api/members', async (req, res) => {
  const { data, error } = await supabase.from('members').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/members — register new member + send welcome email
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

  // Send welcome email (non-blocking)
  sendEmail(email, name, `🏋️ Welcome to GoodLife Fitness! Your Member ID: ${member_id}`, welcomeHtml(name, member_id, plan, end_date))
    .then(r => { if (!r.success) console.error('Welcome email failed:', r.error); });

  res.json(data);
});

// PUT /api/members/:id — update member + send extension email if end_date changed
app.put('/api/members/:id', async (req, res) => {
  const updates = { ...req.body };
  const sendExtEmail = updates._sendExtensionEmail === true;
  delete updates.member_id;
  delete updates.id;
  delete updates._sendExtensionEmail;

  const { data, error } = await supabase
    .from('members').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Send extension email if requested (member extended via website)
  if (sendExtEmail && data.email && data.end_date) {
    sendEmail(
      data.email, data.name,
      `✅ Membership Extended — Valid till ${new Date(data.end_date).toLocaleDateString('en-IN')}`,
      extensionHtml(data.name, data.member_id, data.plan, data.end_date)
    ).then(r => { if (!r.success) console.error('Extension email failed:', r.error); });
  }

  res.json(data);
});

app.delete('/api/members/:id', async (req, res) => {
  const { error } = await supabase.from('members').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════
// OFFERS API
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// STATS API
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// EMAIL BROADCAST API  (admin panel calls these)
// ══════════════════════════════════════════════════════════════

// POST /api/broadcast/offer
app.post('/api/broadcast/offer', async (req, res) => {
  const { offer_id, expiry_override, member_ids } = req.body;
  if (!offer_id) return res.status(400).json({ error: 'offer_id required' });

  const { data: offer } = await supabase.from('offers').select('*').eq('id', offer_id).single();
  if (!offer) return res.status(404).json({ error: 'Offer not found' });

  let q = supabase.from('members').select('name, email').eq('status', 'active');
  if (member_ids?.length) q = q.in('id', member_ids);
  const { data: members } = await q;
  if (!members?.length) return res.status(404).json({ error: 'No active members found' });

  const results = await Promise.all(members.map(m =>
    sendEmail(m.email, m.name, `🔥 ${offer.title} — GoodLife Fitness`, offerHtml(m.name, offer, expiry_override))
  ));
  res.json({ success: true, sent: results.filter(r => r.success).length, total: members.length });
});

// POST /api/broadcast/custom  — send custom subject+body to all active members
app.post('/api/broadcast/custom', async (req, res) => {
  const { subject, body, test_email } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'subject and body required' });

  // If test_email provided — send only to that address
  if (test_email) {
    const r = await sendEmail(test_email, 'Test User', '[TEST] ' + subject, customHtml('Test Member', body));
    return res.json({ success: r.success, sent: r.success ? 1 : 0, total: 1, error: r.error });
  }

  const { data: members } = await supabase.from('members').select('name, email').eq('status', 'active');
  if (!members?.length) return res.status(404).json({ error: 'No active members' });
  const results = await Promise.all(members.map(m => sendEmail(m.email, m.name, subject, customHtml(m.name, body))));
  res.json({ success: true, sent: results.filter(r => r.success).length, total: members.length });
});

// POST /api/broadcast/test-offer  — test offer email to specific address
app.post('/api/broadcast/test-offer', async (req, res) => {
  const { offer_id, test_email, expiry_override } = req.body;
  if (!offer_id || !test_email) return res.status(400).json({ error: 'offer_id and test_email required' });
  const { data: offer } = await supabase.from('offers').select('*').eq('id', offer_id).single();
  if (!offer) return res.status(404).json({ error: 'Offer not found' });
  const r = await sendEmail(test_email, 'Test User', `🔥 [TEST] ${offer.title}`, offerHtml('Test Member', offer, expiry_override));
  res.json({ success: r.success, error: r.error });
});

// POST /api/broadcast/expiry-check  — manual trigger
app.post('/api/broadcast/expiry-check', async (req, res) => {
  const days = parseInt(req.body?.days) || 7;
  const customMsg = req.body?.custom_message || '';
  const test_email = req.body?.test_email || null;
  const result = await runExpiry(days, customMsg, test_email);
  res.json(result);
});

// ── Shared expiry logic ──────────────────────────────────────
async function runExpiry(days = 7, customMsg = '', testEmail = null) {
  const today = new Date();
  const cutoff = new Date(today); cutoff.setDate(today.getDate() + days);
  const fmt = d => d.toISOString().split('T')[0];

  // Test mode — send to one specific email with fake data
  if (testEmail) {
    const fakeExp = new Date(today); fakeExp.setDate(today.getDate() + days);
    const r = await sendEmail(
      testEmail, 'Test User',
      `⏰ [TEST] Membership Expires in ${days} Day${days !== 1 ? 's' : ''}! — GoodLife Fitness`,
      expiryHtml('Test Member', fmt(fakeExp), days, customMsg)
    );
    return { success: r.success, sent: r.success ? 1 : 0, total: 1, error: r.error };
  }

  const { data: members } = await supabase.from('members')
    .select('name, email, end_date')
    .eq('status', 'active')
    .gte('end_date', fmt(today))
    .lte('end_date', fmt(cutoff));

  let sent = 0;
  if (members?.length) {
    const results = await Promise.all(members.map(m => {
      const diff = Math.ceil((new Date(m.end_date) - today) / 86400000);
      return sendEmail(
        m.email, m.name,
        `⏰ Your Membership Expires in ${diff} Day${diff !== 1 ? 's' : ''}! — GoodLife Fitness`,
        expiryHtml(m.name, m.end_date, diff, customMsg)
      );
    }));
    sent = results.filter(r => r.success).length;
  }

  // Mark past-due as expired
  await supabase.from('members').update({ status: 'expired' })
    .lt('end_date', fmt(today)).eq('status', 'active');

  return { success: true, sent, total: members?.length ?? 0 };
}

// ── Cron: Daily 9 AM expiry check ───────────────────────────
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Daily expiry check...');
  const r = await runExpiry(7, '');
  console.log(`✅ Done — ${r.sent} alerts sent`);
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`\n💪 GoodLife Fitness API on port ${PORT}\n`));
