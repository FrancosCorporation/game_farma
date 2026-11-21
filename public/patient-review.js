const $ = (id) => document.getElementById(id);
let patients = [], index = 0, reference = 0, animation = 'Idle', view = '3d';
let preview = null, renderId = 0;
const labels = {
  live: '3D · no jogo',
  candidate: '3D · candidato animado',
  'animated-review': '3D · animação em revisão',
  mesh: '3D · animação pendente',
  reference: 'Referência 2D',
  planned: 'Planejado',
};

async function showArt() {
  const thisRender = ++renderId;
  const patient = patients[index];
  preview?.dispose();
  preview = null;
  window.__patientReviewPreview = null;
  $('viewer').replaceChildren();
  $('open-reference').hidden = true;
  if (patient.model && view === '3d') {
    const params = new URLSearchParams({ m: patient.model, v: patient.version });
    if (['live', 'candidate', 'animated-review'].includes(patient.status)) {
      params.set('anim', animation);
      params.set('play', '1');
    }
    const container = document.createElement('div');
    container.className = 'character-viewer';
    container.textContent = 'Carregando modelo 3D…';
    $('viewer').append(container);
    $('viewer-hint').textContent = 'Arraste para girar e use o zoom. No visualizador, Corpo, Torso e Rosto mudam o enquadramento.';
    try {
      const { createPatientViewer } = await import('./patient-review-3d.js');
      if (thisRender !== renderId) return;
      preview = createPatientViewer(container, params);
      window.__patientReviewPreview = preview.state;
    } catch (error) {
      if (thisRender !== renderId) return;
      preview?.dispose();
      container.textContent = 'Não foi possível abrir o 3D. Recarregue a página para tentar novamente.';
      console.error('[patient-review-3d]', error);
    }
  } else if (patient.references.length) {
    const src = patient.references[reference];
    const image = document.createElement('img');
    image.alt = `${patient.name} — referência ${reference + 1}, corpo inteiro em A-pose`;
    image.addEventListener('error', () => {
      $('viewer-hint').textContent = 'Não foi possível carregar a referência. Tente abrir a imagem original ou recarregue a página.';
    });
    image.src = src;
    $('viewer').append(image);
    $('open-reference').href = src;
    $('open-reference').hidden = false;
    $('viewer-hint').textContent = 'Referência 2D para comparar aparência, roupa e proporções com a malha.';
  } else {
    const empty = document.createElement('div');
    empty.className = 'pending';
    empty.textContent = 'Arte ainda não gerada para este paciente.';
    $('viewer').append(empty);
    $('viewer-hint').textContent = 'Próximas etapas: referência, revisão, malha 3D, rig, animação e teste no jogo.';
  }
}

function showPatient(nextIndex) {
  index = (nextIndex + patients.length) % patients.length;
  reference = 0;
  animation = 'Idle';
  const patient = patients[index];
  reference = patient.selectedReference ?? 0;
  view = patient.model ? '3d' : 'reference';
  $('patient').value = patient.id;
  const url = new URL(location.href);
  url.searchParams.set('patient', patient.id);
  history.replaceState(null, '', url);
  $('patient-name').textContent = `${patient.name}, ${patient.age} anos`;
  $('status').textContent = labels[patient.status];
  $('status').className = `badge ${patient.status}`;
  $('detail').textContent = patient.status === 'live'
    ? (patient.id === 'ana_coriza' ? 'Ana 044 aprovada e publicada. Este é o mesmo arquivo 3D carregado no jogo.' : 'Paciente com modelo próprio e animações de caminhada e repouso no atendimento. Este é o mesmo arquivo 3D carregado no jogo.')
    : patient.status === 'animated-review'
      ? 'Modelo 3D com rig e animações Parada/Caminhando disponível para revisão nesta página. Ainda não está publicado no atendimento.'
      : patient.status === 'mesh'
      ? 'Modelo 3D gerado para conferir a aparência. Esqueleto e animações ainda estão pendentes; esta personagem ainda não participa do atendimento.'
      : patient.status === 'candidate'
        ? 'Modelo 3D com rig e animações Parada/Caminhando disponível para revisão nesta página. Ainda aguarda aprovação visual para publicação no atendimento.'
      : patient.status === 'reference'
      ? 'Referência 2D preparada para a modelagem. Malha 3D, rig e animações para o atendimento continuam pendentes.'
      : 'Paciente previsto no elenco. Ainda não possui um modelo próprio no jogo.';
  $('variants').replaceChildren();
  $('variants').hidden = !patient.references.length;
  const selectView = (button) => {
    for (const node of $('variants').children) node.setAttribute('aria-pressed', String(node === button));
    showArt();
  };
  if (patient.model && patient.references.length) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Modelo 3D';
    button.setAttribute('aria-pressed', 'true');
    button.onclick = () => { view = '3d'; selectView(button); };
    $('variants').append(button);
  }
  patient.references.forEach((src, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Referência ${i + 1}`;
    button.setAttribute('aria-pressed', String(view === 'reference' && i === reference));
    button.onclick = () => {
      reference = i;
      view = 'reference';
      selectView(button);
    };
    $('variants').append(button);
  });
  $('animations').hidden = !['live', 'candidate', 'animated-review'].includes(patient.status);
  for (const button of $('animations').children) button.setAttribute('aria-pressed', String(button.dataset.animation === animation));
  showArt();
}

for (const button of $('animations').children) button.onclick = () => {
  view = '3d';
  for (const variant of $('variants').children) variant.setAttribute('aria-pressed', String(variant.textContent === 'Modelo 3D'));
  animation = button.dataset.animation;
  for (const node of $('animations').children) node.setAttribute('aria-pressed', String(node === button));
  showArt();
};
$('previous').onclick = () => showPatient(index - 1);
$('next').onclick = () => showPatient(index + 1);
$('patient').onchange = () => showPatient(patients.findIndex((p) => p.id === $('patient').value));

try {
  const response = await fetch('patient-review.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const registry = await response.json();
  if (registry.schema !== 1 || !registry.patients?.length) throw new Error('Elenco inválido');
  patients = registry.patients;
  $('patient').replaceChildren(...patients.map((patient) => {
    const option = document.createElement('option');
    option.value = patient.id;
    option.textContent = `${patient.name} — ${labels[patient.status]}`;
    return option;
  }));
  const requested = new URLSearchParams(location.search).get('patient');
  const requestedIndex = patients.findIndex((p) => p.id === requested);
  const anaIndex = patients.findIndex((p) => p.id === 'ana_coriza');
  showPatient(requestedIndex >= 0 ? requestedIndex : Math.max(0, anaIndex));
  for (const id of ['patient', 'previous', 'next']) $(id).disabled = false;
  const withModels = patients.filter((p) => p.model).length;
  const liveModels = patients.filter((p) => p.status === 'live').length;
  $('count').textContent = `${patients.length} pacientes disponíveis para revisão · ${withModels} modelos 3D carregáveis · ${liveModels} publicados no jogo · ${withModels - liveModels} aguardam aprovação para o atendimento`;
} catch (error) {
  $('patient-name').textContent = 'Elenco indisponível';
  $('error').hidden = false;
  $('error').textContent = 'Não foi possível carregar a revisão. Recarregue a página para tentar novamente.';
  console.error('[patient-review]', error);
}
