// n8n Code node — place immediately after the LLM/router output.
const allowed = {
  tool_indicador_citopatologico: { nominal: false, chart: true, parameters: [] },
  tool_busca_ativa_gestantes_atraso: { nominal: true, chart: false, parameters: [] },
  tool_indicador_hipertensao: { nominal: false, chart: true, parameters: [] },
  tool_indicador_diabetes: { nominal: false, chart: true, parameters: [] },
  tool_indicador_idoso: { nominal: false, chart: true, parameters: ['ine'] },
  tool_busca_ativa_idosos: { nominal: true, chart: false, parameters: ['ine'] },
  tool_indicador_vacinacao_infantil: { nominal: false, chart: true, parameters: [] },
  tool_censo_gestantes: { nominal: false, chart: true, parameters: ['ine'] },
  tool_busca_territorial_rua: { nominal: false, chart: true, parameters: ['logradouro', 'ine'] },
  tool_auditoria_cadastros: { nominal: false, chart: true, parameters: [] },
};

const input = $json;
const toolId = input.tool_id ?? null;
const intent = input.intent ?? 'UNSUPPORTED';

if (!['INDICATOR', 'NOMINAL_SEARCH'].includes(intent)) {
  return { json: { ...input, tool_validation: { required: false, valid: true } } };
}

if (!toolId || !allowed[toolId]) {
  return {
    json: {
      ...input,
      tool_validation: {
        required: true,
        valid: false,
        reason: 'tool_not_allowed',
      },
    },
  };
}

const meta = allowed[toolId];
const supplied = input.parameters ?? {};
const cleanParameters = {};

for (const name of meta.parameters) {
  const value = supplied[name];
  if (value === null || value === undefined || value === '') {
    cleanParameters[name] = null;
    continue;
  }

  if (name === 'ine') {
    const normalized = String(value).replace(/\D/g, '').slice(0, 10);
    cleanParameters[name] = normalized || null;
  } else if (name === 'logradouro') {
    cleanParameters[name] = String(value)
      .normalize('NFKC')
      .replace(/[;%_'"\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || null;
  }
}

return {
  json: {
    ...input,
    parameters: cleanParameters,
    tool_meta: meta,
    tool_validation: {
      required: true,
      valid: true,
    },
  },
};
