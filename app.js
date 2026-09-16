const templateSelect = document.getElementById('templateSelect');
const templatePreview = document.getElementById('templatePreview');
const variablesContainer = document.getElementById('variablesContainer');
const generateButton = document.getElementById('generateButton');
const resetButton = document.getElementById('resetButton');
const copyButton = document.getElementById('copyButton');
const presetButtons = document.getElementById('presetButtons');
const copyStatus = document.getElementById('copyStatus');
const output = document.getElementById('output');

const TEMPLATE_BLOCK_SEPARATOR = /^===\s*(.+?)\s*===\s*$/;
const VARIABLE_REGEX = /{{\s*([a-zA-Z0-9_\- ]+)\s*}}/g;

let templates = [];
let currentTemplate = null;
let copyStatusTimerId = null;
let taggedPresetsByVariable = new Map();
let allPresets = [];

function renderPresetButtons(presets, variables = []) {
  if (!presetButtons) {
    return;
  }

  presetButtons.innerHTML = '';
  const variableNames = new Set(variables);

  presets.forEach((preset) => {
    if ((preset.tag && variableNames.has(preset.tag)) || !preset.name || !preset.body) {
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.value = preset.body.trim();
    button.textContent = preset.name.trim();
    presetButtons.appendChild(button); 
  });
}

function renderVariablePresetButtons(variableName) {
  const presets = taggedPresetsByVariable.get(variableName) || [];

  if (presets.length === 0) {
    return '';
  }

  const buttons = presets
    .filter((preset) => preset.name && preset.body)
    .map((preset) => `
      <button type="button" class="variable-preset-button" data-preset-variable="${escapeHtml(variableName)}" value="${escapeHtml(preset.body.trim())}">
        ${escapeHtml(preset.name.trim())}
      </button>
    `)
    .join('');

  return buttons ? `<div class="variable-presets" aria-label="${escapeHtml(variableName)} presets">${buttons}</div>` : '';
}

function setCopyStatus(message) {
  if (!copyStatus) {
    return;
  }

  copyStatus.textContent = message;

  if (copyStatusTimerId) {
    clearTimeout(copyStatusTimerId);
  }

  if (message) {
    copyStatusTimerId = setTimeout(() => {
      copyStatus.textContent = '';
      copyStatusTimerId = null;
    }, 1000);
  }
}

function syncToggleVisibility(toggleInput) {
  const targetId = toggleInput?.dataset.toggleTarget;
  const targetElement = targetId ? document.getElementById(targetId) : null;

  if (targetElement) {
    targetElement.hidden = !toggleInput.checked;
  }
}

function syncVariableToggle(toggleInput) {
  const targetId = toggleInput?.dataset.variableTarget;
  const targetElement = targetId ? document.getElementById(targetId) : null;
  if (targetElement) {
    targetElement.disabled = !toggleInput.checked;
  }
}

function autoResizeOutput() {
  if (!output) {
    return;
  }

  output.style.height = 'auto';
  output.style.height = `${output.scrollHeight}px`;
}

function normalizeGeneratedPrompt(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseTemplates(content) {
  const lines = content.split(/\r?\n/);
  const parsed = [];
  let activeTemplate = null;

  const saveActiveTemplate = () => {
    if (!activeTemplate) {
      return;
    }

    const tagIndex = activeTemplate.body.findIndex((line) => /^tag:\s*.+$/i.test(line.trim()));
    const tag = tagIndex >= 0 ? activeTemplate.body[tagIndex].replace(/^tag:\s*/i, '').trim() : '';

    activeTemplate.body = activeTemplate.body
      .filter((_, index) => index !== tagIndex)
      .join('\n')
      .trim();
    activeTemplate.tag = tag || null;
    parsed.push(activeTemplate);
  };

  for (const line of lines) {
    if (line.startsWith('#')) {
      continue;
    }

    const match = line.match(TEMPLATE_BLOCK_SEPARATOR);

    if (match) {
      saveActiveTemplate();

      activeTemplate = {
        name: match[1],
        body: []
      };
      continue;
    }

    if (activeTemplate) {
      activeTemplate.body.push(line);
    }
  }

  saveActiveTemplate();

  return parsed;
}

function getVariables(templateBody) {
  const unique = new Set();
  let match;
  while ((match = VARIABLE_REGEX.exec(templateBody)) !== null) {
    unique.add(match[1].trim());
  }
  VARIABLE_REGEX.lastIndex = 0;
  return [...unique];
}

function renderTemplateOptions() {
  if (templates.length === 0) {
    templateSelect.innerHTML = '<option value="">No templates found</option>';
    return;
  }
  const options = templates
    .map((template, index) => {
      return `<option value="${index}">${escapeHtml(template.name)}</option>`;
    })
    .join('');
  templateSelect.innerHTML = `<option value="">-- Select template --</option>${options}`;
}

function renderVariableInputs(variables) {
  if (variables.length === 0) {
    variablesContainer.innerHTML = '<p>No variables in this template.</p>';
    return;
  }

  const html = variables
    .map((variableName, index) => {
      const safeName = escapeHtml(variableName);
      const inputId = `var-${index}`;
      const toggleId = `toggle-${inputId}`;
      return `
        <div class="variable-field">
          <label for="${toggleId}">
            <input type="checkbox" id="${toggleId}" data-variable-target="${inputId}" checked>
            Enable ${safeName.toUpperCase()}
          </label>
          <textarea id="${inputId}" class="textarea-variable" data-variable-name="${safeName}" rows="4"></textarea>
          ${renderVariablePresetButtons(variableName)}
        </div>
      `;
    })
    .join('');

  const preHtml = `
        <div class="block">
          <label>
            <input type="checkbox" id="toggle-pre" data-toggle-target="pre-fields">
            Enable PRE
          </label>
          <div id="pre-fields" hidden>
            <!--label for="var-pre">PRE</label-->
            <textarea id="var-pre" class="textarea-variable" data-variable-name="var-pre" rows="4"></textarea>
          </div>
        </div>
      `;
  const postHtml = `
        <div class="block">
          <label>
            <input type="checkbox" id="toggle-post" data-toggle-target="post-fields">
            Enable POST
          </label>
          <div id="post-fields" hidden>
            <!--label for="var-post">POST</label-->
            <textarea id="var-post" class="textarea-variable" data-variable-name="var-post" rows="4"></textarea>
          </div>
        </div>
      `;

  variablesContainer.innerHTML = `<div class='d-flex gap-1'>` + preHtml + postHtml + `</div>` + html;
}

function showSelectedTemplate(indexValue) {
  if (indexValue === '') {
    currentTemplate = null;
    templatePreview.textContent = 'Select a template.';
    variablesContainer.innerHTML = 'No variables yet.';
    renderPresetButtons(allPresets);
    output.value = '';
    autoResizeOutput();
    return;
  }

  const index = Number(indexValue);
  currentTemplate = templates[index] || null;

  if (!currentTemplate) {
    templatePreview.textContent = 'Template not found.';
    variablesContainer.innerHTML = 'No variables yet.';
    renderPresetButtons(allPresets);
    output.value = '';
    autoResizeOutput();
    return;
  }

  templatePreview.textContent = currentTemplate.body;
  const variables = getVariables(currentTemplate.body);
  renderVariableInputs(variables);
  renderPresetButtons(allPresets, variables);
  output.value = '';
  autoResizeOutput();
}

function generatePrompt() {
  if (!currentTemplate) {
    output.value = 'Please select a template first.';
    autoResizeOutput();
    return;
  }

  const variables = getVariables(currentTemplate.body);
  let generated = currentTemplate.body;
  const inputs = variablesContainer.querySelectorAll('textarea[data-variable-name]');
  const valueMap = new Map();

  inputs.forEach((input) => {
    valueMap.set(input.dataset.variableName, input.disabled ? '' : input.value);
  });

  for (const variableName of variables) {
    const value = valueMap.get(variableName) || '';
    const safeVariableName = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const replaceRegex = new RegExp(`{{\\s*${safeVariableName}\\s*}}`, 'g');
    if(value?.length>0) {
      generated = generated.replace(replaceRegex, `# ${safeVariableName.toUpperCase()}\n` + value);
    } else {
      generated = generated.replace(replaceRegex, ``)
    }
  }

  const preEnabled = document.getElementById('toggle-pre')?.checked;
  const postEnabled = document.getElementById('toggle-post')?.checked;
  const preValue = valueMap.get('var-pre') || '';
  const postValue = valueMap.get('var-post') || '';
  const pretext = preEnabled && preValue ? `${preValue}\n\n` : '';
  const posttext = postEnabled && postValue ? `\n\n${postValue}` : '';

  output.value = normalizeGeneratedPrompt(pretext + generated + posttext);
  autoResizeOutput();
}

async function copyOutputToClipboard() {
  const textToCopy = output.value;
  await copyTextToClipboard(textToCopy);
}

async function copyTextToClipboard(textToCopy, showStatus = true) {
  if (!textToCopy) {
    if (showStatus) {
      setCopyStatus('Nothing to copy.');
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(textToCopy);
    if (showStatus) {
      setCopyStatus('Copied.');
    }
  } catch (error) {
    const originalValue = output.value;
    const originalReadOnly = output.hasAttribute('readonly');
    output.removeAttribute('readonly');
    output.value = textToCopy;
    output.select();
    const copied = document.execCommand('copy');
    output.value = originalValue;
    if (originalReadOnly) {
      output.setAttribute('readonly', 'readonly');
    }
    if (showStatus) {
      setCopyStatus(copied ? 'Copied.' : 'Copy failed.');
    }
  }
}

async function copyPresetButtonToClipboard(event) {
  const button = event.target.closest('button');

  if (!button || !presetButtons?.contains(button)) {
    return;
  }

  const textToCopy = button.value || button.textContent?.trim() || '';
  await copyTextToClipboard(textToCopy, false);
}

function resetPromptInputs() {
  const confirmed = window.confirm('Reset all variables and clear generated prompt output?');

  if (!confirmed) {
    return;
  }

  const allVariableTextareas = variablesContainer.querySelectorAll('textarea[data-variable-name]');
  allVariableTextareas.forEach((textarea) => {
    textarea.value = '';
  });

  const toggleInputs = variablesContainer.querySelectorAll('input[data-toggle-target]');
  toggleInputs.forEach((toggleInput) => {
    toggleInput.checked = false;
    syncToggleVisibility(toggleInput);
  });

  const variableToggleInputs = variablesContainer.querySelectorAll('input[data-variable-target]');
  variableToggleInputs.forEach((toggleInput) => {
    toggleInput.checked = true;
    syncVariableToggle(toggleInput);
  });

  output.value = '';
  autoResizeOutput();
  setCopyStatus('');
}

async function loadTemplates() {
  try {
    const response = await fetch('templates.txt');
    if (!response.ok) {
      throw new Error(`Failed to load templates: ${response.status}`);
    }

    const content = await response.text();
    templates = parseTemplates(content);
    renderTemplateOptions();
  } catch (error) {
    templateSelect.innerHTML = '<option value="">Failed to load templates</option>';
    templatePreview.textContent = error.message;
    variablesContainer.innerHTML = 'No variables yet.';
  }
}

async function loadPresets() {
  try {
    const response = await fetch('presets.txt');
    if (!response.ok) {
      throw new Error(`Failed to load presets: ${response.status}`);
    }

    const content = await response.text();
    const presets = parseTemplates(content);
    allPresets = presets;
    taggedPresetsByVariable = presets.reduce((presetsByVariable, preset) => {
      if (!preset.tag) {
        return presetsByVariable;
      }

      const variablePresets = presetsByVariable.get(preset.tag) || [];
      variablePresets.push(preset);
      presetsByVariable.set(preset.tag, variablePresets);
      return presetsByVariable;
    }, new Map());
    const variables = currentTemplate ? getVariables(currentTemplate.body) : [];
    renderPresetButtons(presets, variables);

    if (currentTemplate) {
      renderVariableInputs(getVariables(currentTemplate.body));
    }
  } catch (error) {
    console.error(error);
  }
}

templateSelect.addEventListener('change', (event) => {
  showSelectedTemplate(event.target.value);
});

variablesContainer.addEventListener('input', (event) => {
  if (event.target.matches('textarea[data-variable-name]')) {
    generatePrompt();
  }
});

variablesContainer.addEventListener('click', (event) => {
  const button = event.target.closest('.variable-preset-button');

  if (!button || !variablesContainer.contains(button)) {
    return;
  }

  const variableName = button.dataset.presetVariable;
  const textarea = [...variablesContainer.querySelectorAll('textarea[data-variable-name]')]
    .find((input) => input.dataset.variableName === variableName);

  if (!textarea) {
    return;
  }

  const presetValue = button.value || '';
  textarea.value = textarea.value ? `${textarea.value}\n${presetValue}` : presetValue;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
});

variablesContainer.addEventListener('change', (event) => {
  if (event.target.matches('input[data-toggle-target]')) {
    syncToggleVisibility(event.target);
    generatePrompt();
  }

  if (event.target.matches('input[data-variable-target]')) {
    syncVariableToggle(event.target);
    generatePrompt();
  }
});

generateButton.addEventListener('click', generatePrompt);

if (copyButton) {
  copyButton.addEventListener('click', copyOutputToClipboard);
}

if (presetButtons) {
  presetButtons.addEventListener('click', copyPresetButtonToClipboard);
}

if (resetButton) {
  resetButton.addEventListener('click', resetPromptInputs);
}

if (output) {
  output.addEventListener('click', copyOutputToClipboard);
}

autoResizeOutput();

loadTemplates();
loadPresets();
