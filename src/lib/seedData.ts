import { supabase } from '@/lib/supabase';
import {
  createWalletAccount, createWorker, createContractor, createWorkshop,
  addWageHistory, addOvertimeHistory, addTeamMembership, addAuditLog,
} from '@/lib/dataAccess';

export async function seedTestData(userId: string): Promise<void> {
  // Check if already seeded
  const { data: existingWorkers } = await supabase
    .from('workers')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (existingWorkers && existingWorkers.length > 0) return;

  // Create wallet accounts
  const leumi = await createWalletAccount({ user_id: userId, name: 'Bank Leumi', account_type: 'bank', opening_balance: 10000 });
  const hapoalim = await createWalletAccount({ user_id: userId, name: 'Bank Hapoalim', account_type: 'bank', opening_balance: 5000 });
  const cash = await createWalletAccount({ user_id: userId, name: 'Cash', account_type: 'cash', opening_balance: 2000 });

  // Create opening balance transactions
  for (const acc of [leumi, hapoalim, cash]) {
    if (acc.opening_balance > 0) {
      await supabase.from('wallet_transactions').insert({
        user_id: userId,
        wallet_account_id: acc.id,
        transaction_date: new Date().toISOString().split('T')[0],
        type: 'opening_balance',
        amount: acc.opening_balance,
        description: 'Opening Balance',
        notes: '',
        related_worker_id: null,
        related_contractor_id: null,
        related_claim_id: null,
        transfer_pair_id: null,
      });
    }
  }

  // Create workers
  const ahmed = await createWorker({ user_id: userId, full_name: 'Ahmed', phone: '050-123-4567', profession: 'Painter', worker_type: 'normal', is_active: true, notes: '', default_daily_wage: 250, default_overtime_rate: 40, default_driving_amount: 50, effective_date: '2024-01-01' });
  const mohammad = await createWorker({ user_id: userId, full_name: 'Mohammad', phone: '050-234-5678', profession: 'Electrician', worker_type: 'normal', is_active: true, notes: '', default_daily_wage: 250, default_overtime_rate: 40, default_driving_amount: 50, effective_date: '2024-01-01' });
  const omar = await createWorker({ user_id: userId, full_name: 'Omar', phone: '050-345-6789', profession: 'Plumber', worker_type: 'normal', is_active: true, notes: '', default_daily_wage: 300, default_overtime_rate: 45, default_driving_amount: 50, effective_date: '2024-01-01' });
  const ali = await createWorker({ user_id: userId, full_name: 'Ali', phone: '050-456-7890', profession: 'Carpenter', worker_type: 'normal', is_active: true, notes: '', default_daily_wage: 280, default_overtime_rate: 40, default_driving_amount: 50, effective_date: '2024-01-01' });

  // Create wage history for Ahmed (wage change test: 250 until 14/09, 300 from 15/09)
  await addWageHistory({ user_id: userId, worker_id: ahmed.id, daily_wage: 250, effective_date: '2024-09-01' });
  await addWageHistory({ user_id: userId, worker_id: ahmed.id, daily_wage: 300, effective_date: '2024-09-15' });

  // Create wage history for other workers
  await addWageHistory({ user_id: userId, worker_id: mohammad.id, daily_wage: 250, effective_date: '2024-09-01' });
  await addWageHistory({ user_id: userId, worker_id: omar.id, daily_wage: 300, effective_date: '2024-09-01' });
  await addWageHistory({ user_id: userId, worker_id: ali.id, daily_wage: 280, effective_date: '2024-09-01' });

  // Create contractors
  const hussam = await createContractor({ user_id: userId, name: 'Hussam', company_name: 'Hussam Construction Ltd', phone: '052-111-2222', address: 'Tel Aviv', is_active: true, notes: '' });
  const tareq = await createContractor({ user_id: userId, name: 'Tareq', company_name: 'Tareq Building Co', phone: '052-333-4444', address: 'Jerusalem', is_active: true, notes: '' });
  const majdi = await createContractor({ user_id: userId, name: 'Majdi', company_name: 'Majdi Renovations', phone: '052-555-6666', address: 'Haifa', is_active: true, notes: '' });

  // Create workshops
  const ws1 = await createWorkshop({ user_id: userId, name: 'Workshop A - Tel Aviv', contractor_id: hussam.id, phone: '052-111-2222', address: 'Tel Aviv', workshop_type: 'daily_wage', is_active: true, start_date: '2024-09-01', end_date: null, notes: '' });
  const ws2 = await createWorkshop({ user_id: userId, name: 'Workshop B - Jerusalem', contractor_id: tareq.id, phone: '052-333-4444', address: 'Jerusalem', workshop_type: 'daily_wage', is_active: true, start_date: '2024-09-01', end_date: null, notes: '' });
  const ws3 = await createWorkshop({ user_id: userId, name: 'Workshop C - Haifa', contractor_id: majdi.id, phone: '052-555-6666', address: 'Haifa', workshop_type: 'contract', is_active: true, start_date: '2024-09-01', end_date: null, notes: '' });

  // Create daily registrations for the wage history test
  // Ahmed: 10/09=250, 12/09=250, 15/09=300, 20/09=300 (total=1100)
  const regDates: { worker: typeof ahmed; date: string; wage: number }[] = [
    { worker: ahmed, date: '2024-09-10', wage: 250 },
    { worker: ahmed, date: '2024-09-12', wage: 250 },
    { worker: ahmed, date: '2024-09-15', wage: 300 },
    { worker: ahmed, date: '2024-09-20', wage: 300 },
  ];
  for (const r of regDates) {
    await supabase.from('daily_registrations').insert({
      user_id: userId,
      workshop_id: ws1.id,
      worker_id: r.worker.id,
      work_date: r.date,
      daily_wage: r.wage,
      has_overtime: false,
      overtime_hours: 0,
      overtime_rate: 0,
      has_driving_outbound: false,
      has_driving_return: false,
      driving_amount: 0,
      notes: '',
      is_claimed: false,
    });
  }

  // Create registrations for Mohammad, Omar on the same workshop for claim test
  // 01/09: 8 workers, 02/09: 7 workers, 03/09: 9 workers
  const claimTestDates = [
    { date: '2024-09-01', workers: [ahmed, mohammad, omar, ali] },
    { date: '2024-09-02', workers: [ahmed, mohammad, omar] },
    { date: '2024-09-03', workers: [ahmed, mohammad, omar, ali] },
  ];

  // We need 8 workers on 01/09, 7 on 02/09, 9 on 03/09
  // We only have 4 workers, so let's create more for the test
  const extraWorkers = [];
  for (let i = 1; i <= 6; i++) {
    const w = await createWorker({
      user_id: userId,
      full_name: `Worker ${i + 4}`,
      phone: '',
      profession: 'Laborer',
      worker_type: 'normal',
      is_active: true,
      notes: '',
      default_daily_wage: 250,
      default_overtime_rate: 40,
      default_driving_amount: 50,
      effective_date: '2024-09-01',
    });
    extraWorkers.push(w);
    await addWageHistory({ user_id: userId, worker_id: w.id, daily_wage: 250, effective_date: '2024-09-01' });
  }

  const allWorkers = [ahmed, mohammad, omar, ali, ...extraWorkers];
  // 01/09: 8 workers (first 8)
  for (let i = 0; i < 8; i++) {
    await supabase.from('daily_registrations').insert({
      user_id: userId, workshop_id: ws2.id, worker_id: allWorkers[i].id,
      work_date: '2024-09-01', daily_wage: 250, has_overtime: false, overtime_hours: 0,
      overtime_rate: 0, has_driving_outbound: false, has_driving_return: false,
      driving_amount: 0, notes: '', is_claimed: false,
    });
  }
  // 02/09: 7 workers (first 7)
  for (let i = 0; i < 7; i++) {
    await supabase.from('daily_registrations').insert({
      user_id: userId, workshop_id: ws2.id, worker_id: allWorkers[i].id,
      work_date: '2024-09-02', daily_wage: 250, has_overtime: false, overtime_hours: 0,
      overtime_rate: 0, has_driving_outbound: false, has_driving_return: false,
      driving_amount: 0, notes: '', is_claimed: false,
    });
  }
  // 03/09: 9 workers (all 10 minus 1)
  for (let i = 0; i < 9; i++) {
    await supabase.from('daily_registrations').insert({
      user_id: userId, workshop_id: ws2.id, worker_id: allWorkers[i].id,
      work_date: '2024-09-03', daily_wage: 250, has_overtime: false, overtime_hours: 0,
      overtime_rate: 0, has_driving_outbound: false, has_driving_return: false,
      driving_amount: 0, notes: '', is_claimed: false,
    });
  }

  // Create a contract for Workshop C
  await supabase.from('workshop_contracts').insert({
    user_id: userId,
    workshop_id: ws3.id,
    contract_name: 'Haifa Renovation Project',
    agreed_amount: 50000,
    agreement_type: 'fixed',
    start_date: '2024-09-01',
    end_date: '2024-12-31',
    received_amount: 20000,
    status: 'active',
    notes: '',
  });

  // === Consolidated Claim Test Data (Section 124) ===
  // Create 3 daily-wage workshops for Hussam
  const wsA = await createWorkshop({ user_id: userId, name: 'Workshop A - Hussam', contractor_id: hussam.id, phone: '', address: 'Tel Aviv', workshop_type: 'daily_wage', is_active: true, start_date: '2024-09-01', end_date: null, notes: '' });
  const wsB = await createWorkshop({ user_id: userId, name: 'Workshop B - Hussam', contractor_id: hussam.id, phone: '', address: 'Tel Aviv', workshop_type: 'daily_wage', is_active: true, start_date: '2024-09-01', end_date: null, notes: '' });
  const wsC = await createWorkshop({ user_id: userId, name: 'Workshop C - Hussam', contractor_id: hussam.id, phone: '', address: 'Tel Aviv', workshop_type: 'daily_wage', is_active: true, start_date: '2024-09-01', end_date: null, notes: '' });

  // Helper to create registrations with headcount
  const createReg = async (workshopId: string, date: string, workerId: string, headcount = 1) => {
    await supabase.from('daily_registrations').insert({
      user_id: userId, workshop_id: workshopId, worker_id: workerId,
      work_date: date, daily_wage: 250, has_overtime: false, overtime_hours: 0,
      overtime_rate: 0, has_driving_outbound: false, has_driving_return: false,
      driving_amount: 0, notes: '', is_claimed: false, headcount,
    });
  };

  // Workshop A: 02/09 = 5 workers, 08/09 = 6 workers
  for (let i = 0; i < 5; i++) await createReg(wsA.id, '2024-09-02', allWorkers[i].id);
  for (let i = 0; i < 6; i++) await createReg(wsA.id, '2024-09-08', allWorkers[i].id);

  // Workshop B: 05/09 = 7 workers, 15/09 = 8 workers
  for (let i = 0; i < 7; i++) await createReg(wsB.id, '2024-09-05', allWorkers[i].id);
  for (let i = 0; i < 8; i++) await createReg(wsB.id, '2024-09-15', allWorkers[i].id);

  // Workshop C: 11/09 = 4 workers
  for (let i = 0; i < 4; i++) await createReg(wsC.id, '2024-09-11', allWorkers[i].id);

  // Seed official tax rules using the tax rules service
  const { checkAndUpdateTaxRules } = await import('@/lib/taxRulesService');
  await checkAndUpdateTaxRules(userId);

  await addAuditLog({ user_id: userId, action: 'test_data_seeded', entity_type: 'system' });
}
