import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const MODULE = 'swarmui_native';

const defaults = {
    url: 'http://192.168.1.6:7801',
    model: 'illustriousAnimilf_v10.safetensors',
    lora: '',
    loraWeight: 0.8,
    vae: '',
    prompt: '',
    negative: '',
    steps: 20,
    cfg: 5,
    width: 1024,
    height: 1024,
    sampler: 'euler_ancestral',
};

function settings() {
    if (!extension_settings[MODULE]) {
        extension_settings[MODULE] = {};
    }
    for (const [key, value] of Object.entries(defaults)) {
        if (extension_settings[MODULE][key] === undefined) {
            extension_settings[MODULE][key] = value;
        }
    }
    return extension_settings[MODULE];
}

function setValue(key, value) {
    settings()[key] = value;
    saveSettingsDebounced();
}

function apiUrl(path) {
    return settings().url.replace(/\/+$/, '') + '/API/' + path.replace(/^\/+/, '');
}

async function apiPost(path, body) {
    const response = await fetch(apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`SwarmUI HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(String(data.error));
    }

    return data;
}

async function newSession() {
    const data = await apiPost('GetNewSession', {});
    if (!data.session_id) {
        throw new Error('SwarmUI did not return a session ID.');
    }
    return data.session_id;
}

async function listModels(subtype = undefined) {
    const session_id = await newSession();
    return await apiPost('ListModels', {
        session_id,
        path: '',
        depth: 12,
        ...(subtype ? { subtype } : {}),
    });
}

async function refreshResources(panel) {
    const status = panel.find('#swarmui_native_status');
    status.text('Loading models, LoRAs and VAEs…');

    try {
        const [modelData, loraData, vaeData] = await Promise.all([
            listModels('Stable-Diffusion'),
            listModels('LoRA'),
            listModels('VAE'),
        ]);

        const modelSelect = panel.find('#swarmui_native_model').empty();
        for (const file of modelData.files || []) {
            $('<option>').val(file.name).text(file.name).appendTo(modelSelect);
        }

        const loraSelect = panel.find('#swarmui_native_lora').empty();
        $('<option>').val('').text('None').appendTo(loraSelect);
        for (const file of loraData.files || []) {
            $('<option>').val(file.name).text(file.name).appendTo(loraSelect);
        }

        const vaeSelect = panel.find('#swarmui_native_vae').empty();
        $('<option>').val('').text('Automatic').appendTo(vaeSelect);
        for (const file of vaeData.files || []) {
            $('<option>').val(file.name).text(file.name).appendTo(vaeSelect);
        }

        const s = settings();
        modelSelect.val(s.model);
        if (!modelSelect.val() && modelSelect.find('option').length) {
            s.model = modelSelect.val();
        }

        loraSelect.val(s.lora);
        if (!loraSelect.val()) {
            s.lora = '';
        }

        vaeSelect.val(s.vae || '');
        if (vaeSelect.val() === null) {
            s.vae = '';
        }

        saveSettingsDebounced();
        status.text(`Connected • ${modelSelect.find('option').length} models • ${loraSelect.find('option').length - 1} LoRAs • ${vaeSelect.find('option').length - 1} VAEs`);
    } catch (error) {
        console.error('Native SwarmUI resource error:', error);
        status.text(`Connection failed: ${error.message}`);
    }
}

function bindPanel(panel) {
    const s = settings();

    panel.find('#swarmui_native_url').val(s.url);
    panel.find('#swarmui_native_model').val(s.model);
    panel.find('#swarmui_native_lora').val(s.lora);
    panel.find('#swarmui_native_lora_weight').val(s.loraWeight);
    panel.find('#swarmui_native_vae').val(s.vae || '');
    panel.find('#swarmui_native_prompt').val(s.prompt);
    panel.find('#swarmui_native_negative').val(s.negative);
    panel.find('#swarmui_native_steps').val(s.steps);
    panel.find('#swarmui_native_cfg').val(s.cfg);
    panel.find('#swarmui_native_width').val(s.width);
    panel.find('#swarmui_native_height').val(s.height);
    panel.find('#swarmui_native_sampler').val(s.sampler);

    panel.find('#swarmui_native_url').on('change', function() {
        setValue('url', String($(this).val()).trim());
    });
    panel.find('#swarmui_native_model').on('change', function() {
        setValue('model', String($(this).val()));
    });
    panel.find('#swarmui_native_lora').on('change', function() {
        setValue('lora', String($(this).val()));
    });
    panel.find('#swarmui_native_lora_weight').on('change', function() {
        setValue('loraWeight', Number($(this).val()));
    });
    panel.find('#swarmui_native_vae').on('change', function() {
        setValue('vae', String($(this).val()));
    });
    panel.find('#swarmui_native_prompt').on('input', function() {
        setValue('prompt', String($(this).val()));
    });
    panel.find('#swarmui_native_negative').on('input', function() {
        setValue('negative', String($(this).val()));
    });
    for (const id of ['steps', 'cfg', 'width', 'height']) {
        panel.find(`#swarmui_native_${id}`).on('change', function() {
            setValue(id, Number($(this).val()));
        });
    }
    panel.find('#swarmui_native_sampler').on('change', function() {
        setValue('sampler', String($(this).val()));
    });

    panel.find('#swarmui_native_refresh').on('click', () => refreshResources(panel));
    panel.find('#swarmui_native_generate').on('click', () => generate(panel));
}

async function generate(panel) {
    const s = settings();
    const status = panel.find('#swarmui_native_status');
    const output = panel.find('#swarmui_native_output');

    const prompt = String(panel.find('#swarmui_native_prompt').val() || '').trim();
    if (!prompt) {
        status.text('Enter a prompt first.');
        return;
    }

    const session_id = await newSession();

    const payload = {
        session_id,
        prompt,
        negativeprompt: String(panel.find('#swarmui_native_negative').val() || ''),
        cfgscale: String(Number(panel.find('#swarmui_native_cfg').val()) || 5),
        steps: String(Number(panel.find('#swarmui_native_steps').val()) || 20),
        width: String(Number(panel.find('#swarmui_native_width').val()) || 1024),
        height: String(Number(panel.find('#swarmui_native_height').val()) || 1024),
        model: String(panel.find('#swarmui_native_model').val() || ''),
        sampler: String(panel.find('#swarmui_native_sampler').val() || 'euler_ancestral'),
        images: '1',
    };

    const lora = String(panel.find('#swarmui_native_lora').val() || '');
    if (lora) {
        payload.loras = [lora];
        payload.loraweights = [Number(panel.find('#swarmui_native_lora_weight').val()) || 0.8];
    }

    const vae = String(panel.find('#swarmui_native_vae').val() || '');
    if (vae) {
        payload.vae = vae;
    }

    status.text('Generating…');
    output.empty();

    try {
        const result = await apiPost('GenerateText2Image', payload);
        const imagePath = result.images?.[0];

        if (!imagePath) {
            throw new Error('SwarmUI returned no image.');
        }

        let src = imagePath;
        if (!src.startsWith('data:')) {
            src = new URL(imagePath, s.url.replace(/\\/+$/, '') + '/').toString();
        }

        $('<img>')
            .attr('src', src)
            .attr('alt', 'SwarmUI result')
            .appendTo(output);

        status.text('Generation complete ✅');
    } catch (error) {
        console.error('Native SwarmUI generation error:', error);
        status.text(`Generation failed: ${error.message}`);
    }
}

function openPanel() {
    const html = $(`
        <div id="swarmui_native_panel">
            <div class="swarm_row">
                <input id="swarmui_native_url" class="text_pole" placeholder="SwarmUI URL">
                <button id="swarmui_native_refresh" class="menu_button">Refresh</button>
            </div>

            <div id="swarmui_native_status">Not connected</div>

            <label>Model</label>
            <select id="swarmui_native_model" class="text_pole"></select>

            <label>LoRA</label>
            <select id="swarmui_native_lora" class="text_pole"></select>

            <label>VAE</label>
            <select id="swarmui_native_vae" class="text_pole"></select>

            <div class="swarm_row">
                <div>
                    <label>LoRA weight</label>
                    <input id="swarmui_native_lora_weight" type="number" class="text_pole" min="0" max="2" step="0.05">
                </div>
                <div>
                    <label>Sampler</label>
                    <select id="swarmui_native_sampler" class="text_pole">
                        <option value="euler_ancestral">euler_ancestral</option>
                        <option value="euler">euler</option>
                        <option value="dpmpp_2m">dpmpp_2m</option>
                        <option value="dpmpp_2m_sde">dpmpp_2m_sde</option>
                    </select>
                </div>
            </div>

            <label>Prompt</label>
            <textarea id="swarmui_native_prompt" class="text_pole autoSetHeight" rows="5"></textarea>

            <label>Negative prompt</label>
            <textarea id="swarmui_native_negative" class="text_pole autoSetHeight" rows="3"></textarea>

            <div class="swarm_row">
                <input id="swarmui_native_steps" type="number" class="text_pole" min="1" max="150" step="1" placeholder="Steps">
                <input id="swarmui_native_cfg" type="number" class="text_pole" min="1" max="30" step="0.1" placeholder="CFG">
                <input id="swarmui_native_width" type="number" class="text_pole" min="64" max="2048" step="64" placeholder="Width">
                <input id="swarmui_native_height" type="number" class="text_pole" min="64" max="2048" step="64" placeholder="Height">
            </div>

            <div class="swarm_row">
                <button id="swarmui_native_generate" class="menu_button">Generate</button>
            </div>

            <div id="swarmui_native_output"></div>
            <small>
                Browser origin: <span id="swarmui_native_origin"></span>
            </small>
        </div>
    `);

    $('#swarmui_native_origin').text(window.location.origin);
    bindPanel(html);

    await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
}

function ensureMenuButton() {
    if ($('#swarmui_native_button').length) {
        return true;
    }

    const container = $('#token_counter_wand_container');
    if (!container.length) {
        return false;
    }

    const buttonHtml = `
        <div id="swarmui_native_button" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton"></div>
            <span>Native SwarmUI</span>
        </div>`;

    container.append(buttonHtml);
    $('#swarmui_native_button').on('click', openPanel);
    return true;
}

export function init() {
    settings();
    ensureMenuButton();
    eventSource.on(event_types.APP_INITIALIZED, ensureMenuButton);
    eventSource.on(event_types.APP_READY, ensureMenuButton);
    window.setTimeout(ensureMenuButton, 0);
    window.setTimeout(ensureMenuButton, 500);
}
