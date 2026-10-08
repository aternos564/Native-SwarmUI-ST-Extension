import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

// NOTE: SlashCommand modules are imported lazily inside
// registerSlashCommand(). A static import would fail the entire module
// (and lose the wand button) if those paths ever move. The button must
// never depend on optional features.

const MODULE = 'swarmui_native';

const defaults = {
    url: 'http://192.168.1.6:7801',
    model: 'illustriousAnimilf_v10.safetensors',
    loras: [],
    loraWeight: 0.8,
    vae: '',
    prompt: '',
    negative: '',
    steps: 20,
    cfg: 5,
    width: 1024,
    height: 1024,
    sampler: 'euler_ancestral',
    count: 1,
    seed: -1,
};

function settings() {
    if (!extension_settings[MODULE]) {
        extension_settings[MODULE] = {};
    }
    const s = extension_settings[MODULE];
    // Migrate legacy single-LoRA setting (0.2.x) to the array form.
    if (s.lora !== undefined && s.loras === undefined) {
        s.loras = s.lora ? [s.lora] : [];
        delete s.lora;
    }
    if (!Array.isArray(s.loras)) {
        s.loras = [];
    }
    for (const [key, value] of Object.entries(defaults)) {
        if (s[key] === undefined) {
            s[key] = value;
        }
    }
    return s;
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

        loraSelect.val(s.loras);
        if (loraSelect.val() === null) {
            s.loras = [];
        }

        vaeSelect.val(s.vae || '');
        if (vaeSelect.val() === null) {
            s.vae = '';
        }

        saveSettingsDebounced();
        status.text(`Connected • ${modelSelect.find('option').length} models • ${loraSelect.find('option').length} LoRAs • ${vaeSelect.find('option').length - 1} VAEs`);
    } catch (error) {
        console.error('Native SwarmUI resource error:', error);
        status.text(`Connection failed: ${error.message}`);
    }
}

function bindPanel(panel) {
    const s = settings();

    panel.find('#swarmui_native_url').val(s.url);
    panel.find('#swarmui_native_model').val(s.model);
    panel.find('#swarmui_native_lora').val(s.loras);
    panel.find('#swarmui_native_lora_weight').val(s.loraWeight);
    panel.find('#swarmui_native_vae').val(s.vae || '');
    panel.find('#swarmui_native_prompt').val(s.prompt);
    panel.find('#swarmui_native_negative').val(s.negative);
    panel.find('#swarmui_native_steps').val(s.steps);
    panel.find('#swarmui_native_cfg').val(s.cfg);
    panel.find('#swarmui_native_width').val(s.width);
    panel.find('#swarmui_native_height').val(s.height);
    panel.find('#swarmui_native_sampler').val(s.sampler);
    panel.find('#swarmui_native_count').val(s.count);
    panel.find('#swarmui_native_seed').val(s.seed);

    panel.find('#swarmui_native_url').on('change', function() {
        setValue('url', String($(this).val()).trim());
    });
    panel.find('#swarmui_native_model').on('change', function() {
        setValue('model', String($(this).val()));
    });
    panel.find('#swarmui_native_lora').on('change', function() {
        setValue('loras', Array.from($(this).val() || []).map(String));
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
    for (const id of ['steps', 'cfg', 'width', 'height', 'count', 'seed']) {
        panel.find(`#swarmui_native_${id}`).on('change', function() {
            setValue(id, Number($(this).val()));
        });
    }
    panel.find('#swarmui_native_sampler').on('change', function() {
        setValue('sampler', String($(this).val()));
    });

    panel.find('#swarmui_native_refresh').on('click', () => refreshResources(panel));
    panel.find('#swarmui_native_generate').on('click', () => generate(panel));
    panel.find('#swarmui_native_send_chat').on('click', () => generate(panel, { sendToChat: true }));
}

function resolveImageSrc(imagePath) {
    if (imagePath.startsWith('data:')) {
        return imagePath;
    }
    const base = settings().url.replace(/\/+$/, '') + '/';
    try {
        return new URL(imagePath, base).toString();
    } catch {
        return base + String(imagePath).replace(/^\/+/, '');
    }
}

async function sendToChat(imageSrc, prompt) {
    const context = getContext();
    const message = {
        name: context.name2 || 'SwarmUI',
        is_user: false,
        is_system: false,
        send_date: Date.now(),
        mes: prompt ? `[SwarmUI] ${prompt}` : '[SwarmUI image]',
        extra: {
            media: [{
                url: imageSrc,
                type: 'img',
                title: prompt || 'SwarmUI image',
                generation_type: 'swarmui_native',
                source: 'GENERATED',
            }],
            media_display: 'GALLERY',
            media_index: 0,
            inline_image: false,
        },
    };
    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, 'extension');
    context.addOneMessage(message);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, 'extension');
    await context.saveChat();
    return messageId;
}

async function generate(panel, options = {}) {
    const s = settings();
    const status = panel.find('#swarmui_native_status');
    const output = panel.find('#swarmui_native_output');

    // Prompt passes through untouched: SwarmUI owns prompt syntax.
    const prompt = String(panel.find('#swarmui_native_prompt').val() || '').trim();
    if (!prompt) {
        status.text('Enter a prompt first.');
        return { images: [] };
    }

    let session_id;
    try {
        session_id = await newSession();
    } catch (error) {
        console.error('Native SwarmUI session error:', error);
        status.text(`Connection failed: ${error.message}`);
        return { images: [] };
    }

    const count = Math.min(4, Math.max(1, Number(panel.find('#swarmui_native_count').val()) || 1));
    const seed = Number(panel.find('#swarmui_native_seed').val());
    const loras = Array.from(panel.find('#swarmui_native_lora').val() || []).map(String);
    const loraWeight = Number(panel.find('#swarmui_native_lora_weight').val()) || 0.8;
    // Field names/types per SwarmUI T2IParamTypes (prompt, negativeprompt,
    // model, loras/loraweights, vae, sampler, steps, cfgscale, width,
    // height, images, seed); numbers stay numbers.
    const payload = {
        session_id,
        prompt,
        negativeprompt: String(panel.find('#swarmui_native_negative').val() || ''),
        cfgscale: Number(panel.find('#swarmui_native_cfg').val()) || 5,
        steps: Math.round(Number(panel.find('#swarmui_native_steps').val()) || 20),
        width: Math.round(Number(panel.find('#swarmui_native_width').val()) || 1024),
        height: Math.round(Number(panel.find('#swarmui_native_height').val()) || 1024),
        model: String(panel.find('#swarmui_native_model').val() || ''),
        sampler: String(panel.find('#swarmui_native_sampler').val() || 'euler_ancestral'),
        images: count,
        seed: Number.isFinite(seed) ? Math.round(seed) : -1,
    };

    if (loras.length) {
        payload.loras = loras;
        payload.loraweights = loras.map(() => loraWeight);
    }

    const vae = String(panel.find('#swarmui_native_vae').val() || '');
    if (vae) {
        payload.vae = vae;
    }

    status.text('Generating…');
    output.empty();

    try {
        const result = await apiPost('GenerateText2Image', payload);
        const imagePaths = result.images || [];

        if (!imagePaths.length) {
            throw new Error('SwarmUI returned no image.');
        }

        const srcs = imagePaths.map(resolveImageSrc);
        for (const src of srcs) {
            $('<img>')
                .attr('src', src)
                .attr('alt', 'SwarmUI result')
                .appendTo(output);
        }

        if (options.sendToChat) {
            for (const src of srcs) {
                await sendToChat(src, prompt);
            }
            status.text(`Generation complete ✅ • sent ${srcs.length} image(s) to chat`);
        } else {
            status.text(`Generation complete ✅ • ${srcs.length} image(s)`);
        }
        return { images: srcs };
    } catch (error) {
        console.error('Native SwarmUI generation error:', error);
        status.text(`Generation failed: ${error.message}`);
        return { images: [] };
    }
}

async function openPanel() {
    const html = $(`
        <div id="swarmui_native_panel">
            <div class="swarm_row">
                <input id="swarmui_native_url" class="text_pole" placeholder="SwarmUI URL">
                <button id="swarmui_native_refresh" class="menu_button">Refresh</button>
            </div>

            <div id="swarmui_native_status">Not connected</div>

            <label>Model</label>
            <select id="swarmui_native_model" class="text_pole"></select>

            <label>LoRA (Ctrl/Cmd-click for multiple; one weight applies to all)</label>
            <select id="swarmui_native_lora" class="text_pole" multiple size="4"></select>

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
                <div>
                    <label>Images (1–4)</label>
                    <input id="swarmui_native_count" type="number" class="text_pole" min="1" max="4" step="1">
                </div>
                <div>
                    <label>Seed (-1 = random)</label>
                    <input id="swarmui_native_seed" type="number" class="text_pole" step="1">
                </div>
            </div>

            <div class="swarm_row">
                <button id="swarmui_native_generate" class="menu_button">Generate</button>
                <button id="swarmui_native_send_chat" class="menu_button" title="Generate and post the image(s) to the current chat">Generate + Send to Chat</button>
            </div>

            <div id="swarmui_native_output"></div>
            <small>
                Browser origin: <span id="swarmui_native_origin"></span>
            </small>
        </div>
    `);

    html.find('#swarmui_native_origin').text(window.location.origin);
    bindPanel(html);
    // Load real models/LoRAs/VAEs immediately so the panel never shows
    // stale hard-coded lists. Failures surface in #swarmui_native_status.
    refreshResources(html);

    await callGenericPopup(html, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });
}

const BUTTON_ID = 'swarmui_native_button';
const OWN_CONTAINER_ID = 'swarmui_native_wand_container';
const LEGACY_CONTAINER_ID = 'token_counter_wand_container';

function log(...args) {
    console.log('[Native SwarmUI]', ...args);
}

function getMenuContainer() {
    let own = $(`#${OWN_CONTAINER_ID}`);
    if (own.length) {
        return own;
    }

    const menu = $('#extensionsMenu');
    if (menu.length) {
        own = $(`<div id="${OWN_CONTAINER_ID}" class="extension_container"></div>`);
        menu.append(own);
        log(`created own wand container #${OWN_CONTAINER_ID}`);
        return own;
    }

    const legacy = $(`#${LEGACY_CONTAINER_ID}`);
    if (legacy.length) {
        return legacy;
    }

    return $();
}

function ensureMenuButton() {
    if ($(`#${BUTTON_ID}`).length) {
        return true;
    }

    const container = getMenuContainer();
    if (!container.length) {
        log('wand menu not ready yet, retrying later');
        return false;
    }

    const buttonHtml = `
        <div id="${BUTTON_ID}" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton"></div>
            <span>Native SwarmUI</span>
        </div>`;

    container.append(buttonHtml);
    $(`#${BUTTON_ID}`).on('click', openPanel);
    log(`button #${BUTTON_ID} created in #${container.attr('id') || 'extensionsMenu'}`);
    return true;
}

function watchWandMenu() {
    if (typeof MutationObserver === 'undefined') {
        return;
    }

    const observer = new MutationObserver(() => {
        if ($(`#${BUTTON_ID}`).length) {
            observer.disconnect();
            return;
        }
        if (ensureMenuButton()) {
            observer.disconnect();
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout(() => observer.disconnect(), 15000);
    }
}

let initialized = false;

async function slashGenerate(promptText) {
    const s = settings();
    const prompt = String(promptText || '').trim();
    if (!prompt) {
        return '';
    }
    const session_id = await newSession();
    const payload = {
        session_id,
        prompt,
        negativeprompt: s.negative || '',
        cfgscale: Number(s.cfg) || 5,
        steps: Math.round(Number(s.steps)) || 20,
        width: Math.round(Number(s.width)) || 1024,
        height: Math.round(Number(s.height)) || 1024,
        model: s.model || '',
        sampler: s.sampler || 'euler_ancestral',
        images: Math.min(4, Math.max(1, Math.round(Number(s.count)) || 1)),
        seed: Number.isFinite(Number(s.seed)) ? Math.round(Number(s.seed)) : -1,
    };
    if (s.loras && s.loras.length) {
        payload.loras = s.loras.map(String);
        payload.loraweights = s.loras.map(() => Number(s.loraWeight) || 0.8);
    }
    if (s.vae) {
        payload.vae = s.vae;
    }
    const result = await apiPost('GenerateText2Image', payload);
    const srcs = (result.images || []).map(resolveImageSrc);
    for (const src of srcs) {
        await sendToChat(src, prompt);
    }
    return srcs[0] || '';
}

async function registerSlashCommand() {
    try {
        const { SlashCommand } = await import('../../../slash-commands/SlashCommand.js');
        const { SlashCommandParser } = await import('../../../slash-commands/SlashCommandParser.js');
        SlashCommandParser.addCommandObject(SlashCommand.fromProps({
            name: 'swarm',
            callback: async (_args, value) => await slashGenerate(value),
            returns: 'URL of the generated image, or empty string on failure',
            helpString: 'Generate an image with native SwarmUI (model/LoRA/VAE/sampler from the Native SwarmUI panel) and post it to chat. Usage: /swarm your prompt here',
        }));
        log('slash command /swarm registered');
    } catch (error) {
        console.warn('[Native SwarmUI] slash command registration failed:', error);
    }
}

export function init() {
    if (initialized) {
        ensureMenuButton();
        return;
    }
    initialized = true;

    log('init called');
    settings();
    ensureMenuButton();
    registerSlashCommand();
    try {
        eventSource.on(event_types.APP_INITIALIZED, ensureMenuButton);
        eventSource.on(event_types.APP_READY, ensureMenuButton);
    } catch (error) {
        console.warn('[Native SwarmUI] event subscription failed:', error);
    }
    window.setTimeout(ensureMenuButton, 0);
    window.setTimeout(ensureMenuButton, 500);
    window.setTimeout(ensureMenuButton, 2000);
    watchWandMenu();
}

// Direct-execution fallback (same pattern as real third-party
// extensions like Extension-Dice): if the `activate` hook is missed,
// the module still self-initializes on load. Guarded + idempotent.
if (typeof jQuery !== 'undefined') {
    jQuery(() => {
        try {
            init();
        } catch (error) {
            console.error('[Native SwarmUI] fallback init failed:', error);
        }
    });
} else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            init();
        } catch (error) {
            console.error('[Native SwarmUI] fallback init failed:', error);
        }
    });
}
