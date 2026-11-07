// Definição dos campos padrão, atalhos de seleção e formatação para exibição.
import { maskCPF, maskCEP, maskPhone, maskPlaca, calcAge, formatDateBR } from './utils.js';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export const GROUPS = [
  {
    id: 'pessoais', label: 'Dados pessoais',
    fields: [
      { id: 'nome', label: 'Nome completo', maxlength: 120 },
      { id: 'nascimento', label: 'Data de nascimento', type: 'date', maxToday: true },
      { id: 'idade', label: 'Idade', computed: true },
      { id: 'sexo', label: 'Sexo/gênero', type: 'select', options: ['Feminino', 'Masculino', 'Outro', 'Prefiro não informar'] },
      { id: 'estado_civil', label: 'Estado civil', type: 'select', options: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Separado(a)', 'Divorciado(a)', 'Viúvo(a)'] },
      { id: 'mae', label: 'Nome da mãe', maxlength: 120 },
      { id: 'pai', label: 'Nome do pai', maxlength: 120 },
      { id: 'profissao', label: 'Profissão', maxlength: 80 },
    ],
  },
  {
    id: 'contato', label: 'Contato',
    fields: [
      { id: 'email', label: 'E-mail', inputType: 'email', inputmode: 'email', maxlength: 120 },
      { id: 'celular', label: 'Celular', inputType: 'tel', inputmode: 'tel', mask: maskPhone, maxlength: 15, placeholder: '(00) 00000-0000' },
      { id: 'telefone', label: 'Telefone fixo', inputType: 'tel', inputmode: 'tel', mask: maskPhone, maxlength: 15, placeholder: '(00) 0000-0000' },
      { id: 'emergencia_nome', label: 'Contato de emergência (nome)', maxlength: 120 },
      { id: 'emergencia_tel', label: 'Contato de emergência (telefone)', inputType: 'tel', inputmode: 'tel', mask: maskPhone, maxlength: 15, placeholder: '(00) 00000-0000' },
    ],
  },
  {
    id: 'documentos', label: 'Documentos',
    fields: [
      { id: 'cpf', label: 'CPF', inputmode: 'numeric', mask: maskCPF, maxlength: 14, placeholder: '000.000.000-00', validate: 'cpf' },
      { id: 'rg', label: 'RG (número)', maxlength: 20 },
      { id: 'rg_orgao', label: 'RG (órgão emissor/UF)', maxlength: 20, placeholder: 'Ex.: SSP/PR' },
      { id: 'cnh', label: 'CNH (número)', inputmode: 'numeric', maxlength: 20 },
      { id: 'cnh_categoria', label: 'CNH (categoria)', type: 'select', options: ['A', 'B', 'AB', 'C', 'D', 'E', 'ACC'] },
      { id: 'cnh_validade', label: 'CNH (validade)', type: 'date' },
    ],
  },
  {
    id: 'endereco', label: 'Endereço',
    fields: [
      { id: 'cep', label: 'CEP', inputmode: 'numeric', mask: maskCEP, maxlength: 9, placeholder: '00000-000' },
      { id: 'logradouro', label: 'Logradouro (rua/avenida)', maxlength: 120 },
      { id: 'numero', label: 'Número', maxlength: 12 },
      { id: 'complemento', label: 'Complemento', maxlength: 60 },
      { id: 'bairro', label: 'Bairro', maxlength: 80 },
      { id: 'cidade', label: 'Cidade', maxlength: 80 },
      { id: 'uf', label: 'Estado (UF)', type: 'select', options: UFS },
    ],
  },
  {
    id: 'saude', label: 'Saúde e outros',
    fields: [
      { id: 'convenio', label: 'Convênio/plano de saúde', maxlength: 80 },
      { id: 'convenio_numero', label: 'Número da carteirinha', maxlength: 40 },
      { id: 'tipo_sanguineo', label: 'Tipo sanguíneo', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
      { id: 'alergias', label: 'Alergias', type: 'textarea', maxlength: 300 },
      { id: 'placa', label: 'Placa do veículo', mask: maskPlaca, maxlength: 8 },
      { id: 'pix', label: 'Chave PIX', maxlength: 120 },
    ],
  },
];

export const ALL = Object.fromEntries(GROUPS.flatMap((g) => g.fields.map((f) => [f.id, f])));

export const QUICK_SETS = [
  { id: 'basico', label: 'Cadastro básico', keys: ['nome', 'cpf', 'nascimento', 'celular', 'email'] },
  { id: 'endereco', label: 'Endereço completo', keys: ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] },
  { id: 'documentos', label: 'Documentos', keys: ['cpf', 'rg', 'rg_orgao', 'cnh', 'cnh_categoria', 'cnh_validade'] },
  { id: 'saude', label: 'Saúde', keys: ['convenio', 'convenio_numero', 'tipo_sanguineo', 'alergias', 'emergencia_nome', 'emergencia_tel'] },
];

export function displayValue(profile, id) {
  if (id === 'idade') {
    const a = calcAge(profile.values.nascimento);
    return a == null ? '' : `${a} ${a === 1 ? 'ano' : 'anos'}`;
  }
  const v = String(profile.values[id] || '').trim();
  if (!v) return '';
  return ALL[id] && ALL[id].type === 'date' ? formatDateBR(v) : v;
}

// Itens preenchidos e visíveis do perfil, na ordem dos grupos (campos personalizados no fim).
export function shareItems(profile, hidden = []) {
  const items = [];
  for (const g of GROUPS) {
    for (const f of g.fields) {
      if (hidden.includes(f.id)) continue;
      const value = displayValue(profile, f.id);
      if (value) items.push({ key: f.id, label: f.label, value });
    }
  }
  for (const c of profile.customFields) {
    const value = String(c.value || '').trim();
    if (value) items.push({ key: `c:${c.id}`, label: c.label || 'Campo', value });
  }
  return items;
}
