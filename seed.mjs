import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gtnnuoyimddhbklrlpje.supabase.co";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bm51b3lpbWRkaGJrbHJscGplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjgyMzUwNCwiZXhwIjoyMDYyMzk5NTA0fQ.qDKpghRULKbO-oefEucE34fwASBjLHGscIQ7f9cqMWc";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("Starting seed...");

  // 1. Create auth users
  console.log("Creating auth users...");

  const users = [
    { email: "admin@hub360.com.br", password: "Hub360@2025", name: "Ricardo Mendes", role: "admin" },
    { email: "dev@hub360.com.br", password: "Hub360@2025", name: "Ana Souza", role: "dev" },
    { email: "pm@hub360.com.br", password: "Hub360@2025", name: "Carlos Lima", role: "pm" },
  ];

  const authUserIds = [];

  for (const user of users) {
    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === user.email);

    if (existing) {
      console.log(`  User ${user.email} already exists: ${existing.id}`);
      authUserIds.push(existing.id);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
      });

      if (error) {
        console.error(`  Error creating ${user.email}:`, error.message);
        continue;
      }
      console.log(`  Created ${user.email}: ${data.user.id}`);
      authUserIds.push(data.user.id);
    }
  }

  // 2. Create projects
  console.log("Creating projects...");

  const projects = [
    { name: "AZ-IB", slug: "az-ib", description: "App bancario AZ-IB" },
    { name: "Liscan", slug: "liscan", description: "App Liscan iOS" },
    { name: "NEX Solar", slug: "nex-solar", description: "Plataforma de financiamento solar" },
  ];

  const projectIds = [];

  for (const project of projects) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .eq("slug", project.slug)
      .single();

    if (existing) {
      console.log(`  Project ${project.name} already exists: ${existing.id}`);
      projectIds.push(existing.id);
    } else {
      const { data, error } = await supabase
        .from("projects")
        .insert(project)
        .select("id")
        .single();

      if (error) {
        console.error(`  Error creating project ${project.name}:`, error.message);
        continue;
      }
      console.log(`  Created ${project.name}: ${data.id}`);
      projectIds.push(data.id);
    }
  }

  // 3. Create team members
  console.log("Creating team members...");

  const teamMemberIds = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const authId = authUserIds[i];
    if (!authId) continue;

    const { data: existing } = await supabase
      .from("team_members")
      .select("id")
      .eq("email", user.email)
      .single();

    if (existing) {
      console.log(`  Team member ${user.name} already exists: ${existing.id}`);
      teamMemberIds.push(existing.id);
    } else {
      const { data, error } = await supabase
        .from("team_members")
        .insert({
          auth_user_id: authId,
          name: user.name,
          email: user.email,
          role: user.role,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`  Error creating team member ${user.name}:`, error.message);
        continue;
      }
      console.log(`  Created ${user.name}: ${data.id}`);
      teamMemberIds.push(data.id);
    }
  }

  // 4. Create bugs
  console.log("Creating bugs...");

  const bugsData = [
    {
      project_idx: 0, // AZ-IB
      title: 'Botao "Fazer Pix" nao responde ao toque',
      where_found: "Tela inicial > Menu > Pix > Botao Fazer Pix",
      steps_taken: "Abri o app, fui no menu, cliquei em Pix, toquei no botao Fazer Pix",
      expected_behavior: "Esperava abrir a tela de transferencia Pix",
      actual_behavior: "Nada acontece. O botao nao responde. A tela fica travada sem feedback visual.",
      severity: "critical",
      device_info: "Samsung Galaxy A34 / Android 14",
      reporter_name: "Joao Silva",
      reporter_email: "joao@email.com",
      status: "new",
      assigned_to_idx: null,
    },
    {
      project_idx: 0, // AZ-IB
      title: "Saldo exibido esta negativo incorretamente",
      where_found: "Tela inicial > Saldo",
      steps_taken: "Fiz login no app, olhei o saldo exibido na tela inicial",
      expected_behavior: "Ver o saldo correto da minha conta (R$ 1.500,00)",
      actual_behavior: "O saldo aparece como -R$ 1.500,00 com o sinal negativo na frente, sendo que nao tenho dividas",
      severity: "high",
      device_info: "iPhone 14 / iOS 17.4",
      reporter_name: "Maria Santos",
      reporter_email: "maria@email.com",
      status: "analyzing",
      assigned_to_idx: 1, // Ana
    },
    {
      project_idx: 0, // AZ-IB
      title: "Texto de confirmacao de transferencia cortado",
      where_found: "Transferencia > Confirmacao",
      steps_taken: "Fiz uma transferencia de valor alto, cheguei na tela de confirmacao",
      expected_behavior: "Ver o texto completo de confirmacao com o valor e dados do destinatario",
      actual_behavior: "O texto esta cortado na parte de baixo, nao consigo ver os dados completos do destinatario",
      severity: "medium",
      device_info: "Motorola G54 / Android 13",
      reporter_name: "Pedro Costa",
      status: "fixing",
      assigned_to_idx: 1, // Ana
    },
    {
      project_idx: 0, // AZ-IB
      title: "Icone do menu 'Cartoes' esta pixelado",
      where_found: "Tela inicial > Menu inferior > Cartoes",
      steps_taken: "Abri o app normalmente",
      expected_behavior: "Icone nitido e claro",
      actual_behavior: "O icone do menu Cartoes aparece borrado/pixelado em telas de alta resolucao",
      severity: "low",
      device_info: "Samsung Galaxy S24 Ultra / Android 14",
      reporter_name: "Lucia Ferreira",
      status: "resolved",
      assigned_to_idx: 1, // Ana
    },
    {
      project_idx: 1, // Liscan
      title: "Camera trava ao escanear codigo de barras longo",
      where_found: "Tela de Scan > Camera",
      steps_taken: "Abri o scanner, apontei para um codigo de barras de boleto bancario (44 digitos)",
      expected_behavior: "Ler o codigo e mostrar os dados do boleto",
      actual_behavior: "A camera congela por 5 segundos e depois o app fecha sozinho (crash)",
      severity: "critical",
      device_info: "iPhone 13 / iOS 17.2",
      reporter_name: "Fernando Oliveira",
      reporter_email: "fernando@empresa.com",
      status: "fixing",
      assigned_to_idx: 0, // Ricardo
    },
    {
      project_idx: 1, // Liscan
      title: "Historico de scans nao carrega mais que 50 itens",
      where_found: "Menu > Historico",
      steps_taken: "Escaneei mais de 50 codigos e tentei ver o historico completo",
      expected_behavior: "Ver todos os scans realizados com scroll infinito",
      actual_behavior: "A lista para no item 50 e nao carrega mais, mesmo scrollando. Sem mensagem de erro.",
      severity: "medium",
      device_info: "iPad Air 5 / iPadOS 17.3",
      reporter_name: "Carla Rocha",
      status: "new",
      assigned_to_idx: null,
    },
    {
      project_idx: 2, // NEX Solar
      title: "Simulacao de financiamento mostra taxa de juros errada",
      where_found: "Simulador > Resultado",
      steps_taken: "Preenchi o simulador com valor de R$ 50.000, prazo de 120 meses, e cliquei em Simular",
      expected_behavior: "Ver taxa de 1.49% a.m. conforme tabela da Fiducia",
      actual_behavior: "A taxa exibida e 2.99% a.m., o dobro do correto. As parcelas ficam muito altas.",
      severity: "critical",
      device_info: "Windows / Chrome 122",
      reporter_name: "Marcos Vendedor",
      reporter_email: "marcos@ecosolar.com.br",
      status: "new",
      assigned_to_idx: null,
    },
    {
      project_idx: 2, // NEX Solar
      title: "Upload de documento RG falha com arquivos acima de 5MB",
      where_found: "Cadastro > Documentos > Upload RG",
      steps_taken: "Tirei foto do RG com camera de 108MP, tentei fazer upload do arquivo de 12MB",
      expected_behavior: "Upload do documento com redimensionamento automatico",
      actual_behavior: "Mensagem de erro generica: 'Erro ao enviar arquivo'. Sem indicacao de limite de tamanho.",
      severity: "high",
      device_info: "Windows / Firefox 123",
      reporter_name: "Julia Atendente",
      status: "analyzing",
      assigned_to_idx: 2, // Carlos
    },
    {
      project_idx: 2, // NEX Solar
      title: "Data de nascimento aceita datas futuras",
      where_found: "Cadastro > Dados Pessoais > Data de Nascimento",
      steps_taken: "No campo data de nascimento, digitei 15/03/2030",
      expected_behavior: "Validacao impedindo datas futuras",
      actual_behavior: "O sistema aceita normalmente e avanca para a proxima etapa sem nenhum aviso",
      severity: "medium",
      device_info: "Mac / Safari 17.3",
      reporter_name: "Roberto Gerente",
      status: "awaiting_validation",
      assigned_to_idx: 1, // Ana
    },
    {
      project_idx: 0, // AZ-IB
      title: "Notificacao de push chega duplicada",
      where_found: "Notificacoes push do app",
      steps_taken: "Recebi uma notificacao de transferencia recebida, mas chegaram duas identicas",
      expected_behavior: "Receber apenas uma notificacao por evento",
      actual_behavior: "Duas notificacoes identicas aparecem simultaneamente. As vezes tres.",
      severity: "medium",
      device_info: "Xiaomi Redmi Note 12 / Android 13",
      reporter_name: "Amanda Vieira",
      reporter_email: "amanda@email.com",
      status: "new",
      assigned_to_idx: null,
    },
    {
      project_idx: 1, // Liscan
      title: "Modo escuro nao aplica na tela de configuracoes",
      where_found: "Configuracoes > Tema",
      steps_taken: "Ativei o modo escuro nas configuracoes do app",
      expected_behavior: "Toda a interface mudar para tema escuro",
      actual_behavior: "A propria tela de configuracoes permanece em fundo branco. Somente as outras telas mudam.",
      severity: "low",
      device_info: "iPhone 15 Pro / iOS 17.4",
      reporter_name: "Diego Martins",
      status: "closed",
      assigned_to_idx: 0, // Ricardo
    },
    {
      project_idx: 2, // NEX Solar
      title: "Botao 'Voltar' na tela de proposta nao funciona",
      where_found: "Proposta > Tela de Resumo",
      steps_taken: "Cheguei na tela de resumo da proposta e cliquei em Voltar para corrigir dados",
      expected_behavior: "Retornar para a etapa anterior mantendo os dados preenchidos",
      actual_behavior: "Nada acontece ao clicar. O botao nao tem interacao visivel. Preciso recarregar e perco tudo.",
      severity: "high",
      device_info: "Windows / Edge 122",
      reporter_name: "Patricia Vendedora",
      status: "reopened",
      assigned_to_idx: 2, // Carlos
    },
  ];

  for (const bug of bugsData) {
    const projectId = projectIds[bug.project_idx];
    if (!projectId) continue;

    const assignedTo = bug.assigned_to_idx !== null ? teamMemberIds[bug.assigned_to_idx] : null;

    const { data, error } = await supabase
      .from("bugs")
      .insert({
        project_id: projectId,
        title: bug.title,
        where_found: bug.where_found,
        steps_taken: bug.steps_taken,
        expected_behavior: bug.expected_behavior,
        actual_behavior: bug.actual_behavior,
        severity: bug.severity,
        device_info: bug.device_info,
        reporter_name: bug.reporter_name,
        reporter_email: bug.reporter_email || null,
        status: bug.status,
        assigned_to: assignedTo,
      })
      .select("id, number")
      .single();

    if (error) {
      console.error(`  Error creating bug "${bug.title.substring(0, 40)}...":`, error.message);
    } else {
      console.log(`  Bug #${data.number}: ${bug.title.substring(0, 50)}...`);
    }
  }

  // 5. Add some notes to existing bugs
  console.log("Adding notes...");

  const { data: allBugs } = await supabase
    .from("bugs")
    .select("id, number, status")
    .order("number");

  if (allBugs && teamMemberIds.length > 0) {
    const notes = [
      { bugIdx: 1, authorIdx: 1, content: "Investigando. Parece ser um problema de formatacao no componente de saldo. O sinal negativo vem da API quando o campo 'tipo_saldo' e diferente de 'disponivel'." },
      { bugIdx: 2, authorIdx: 1, content: "Corrigido o overflow do texto. Ajustei o container para usar flex-wrap e adicionei scroll quando necessario. Testando em dispositivos com tela pequena." },
      { bugIdx: 4, authorIdx: 0, content: "O crash acontece porque o parser de codigo de barras tenta alocar buffer pra todo o frame da camera. Vou implementar um limite de resolucao no scanner." },
      { bugIdx: 8, authorIdx: 2, content: "Validacao adicionada no frontend e no backend. Aguardando QA validar antes de fechar." },
    ];

    for (const note of notes) {
      if (!allBugs[note.bugIdx] || !teamMemberIds[note.authorIdx]) continue;

      const { error } = await supabase.from("bug_notes").insert({
        bug_id: allBugs[note.bugIdx].id,
        author_id: teamMemberIds[note.authorIdx],
        content: note.content,
      });

      if (error) {
        console.error(`  Error adding note:`, error.message);
      } else {
        console.log(`  Note added to bug #${allBugs[note.bugIdx].number}`);
      }
    }
  }

  console.log("\nSeed complete!");
  console.log("\nLogin credentials:");
  console.log("  admin@hub360.com.br / Hub360@2025");
  console.log("  dev@hub360.com.br / Hub360@2025");
  console.log("  pm@hub360.com.br / Hub360@2025");
}

seed().catch(console.error);
