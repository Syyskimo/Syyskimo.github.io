
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(window.document);
(function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    function attribute_to_object(attributes) {
        const result = {};
        for (const attribute of attributes) {
            result[attribute.name] = attribute.value;
        }
        return result;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    let SvelteElement;
    if (typeof HTMLElement === 'function') {
        SvelteElement = class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' });
            }
            connectedCallback() {
                const { on_mount } = this.$$;
                this.$$.on_disconnect = on_mount.map(run).filter(is_function);
                // @ts-ignore todo: improve typings
                for (const key in this.$$.slotted) {
                    // @ts-ignore todo: improve typings
                    this.appendChild(this.$$.slotted[key]);
                }
            }
            attributeChangedCallback(attr, _oldValue, newValue) {
                this[attr] = newValue;
            }
            disconnectedCallback() {
                run_all(this.$$.on_disconnect);
            }
            $destroy() {
                destroy_component(this, 1);
                this.$destroy = noop;
            }
            $on(type, callback) {
                // TODO should this delegate to addEventListener?
                const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
                callbacks.push(callback);
                return () => {
                    const index = callbacks.indexOf(callback);
                    if (index !== -1)
                        callbacks.splice(index, 1);
                };
            }
            $set($$props) {
                if (this.$$set && !is_empty($$props)) {
                    this.$$.skip_bound = true;
                    this.$$set($$props);
                    this.$$.skip_bound = false;
                }
            }
        };
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.37.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev('SvelteDOMSetProperty', { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }

    function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }

    // transfix.js
    function fix(transtion) {
        return function(node, params){
            Object.defineProperty(node, 'ownerDocument', { get: function() { return {head: node.parentNode}; } });
            return transtion(node, params)
        }
    }

    function setCookie(cname, cvalue, exdays) {
        var d = new Date();
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
        var expires = "expires="+d.toUTCString();
        document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
    }

    function getCookie(cname) {
        var name = cname + "=";
        var ca = document.cookie.split(';');
        for(var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }

    function isBlank(str) {
        return (!str || /^\s*$/.test(str));
    }

    /* src\Consent.svelte generated by Svelte v3.37.0 */

    const { console: console_1 } = globals;
    const file$1 = "src\\Consent.svelte";

    // (119:0) {#if showExtra}
    function create_if_block(ctx) {
    	let div;
    	let slot0;
    	let t;
    	let slot1;
    	let div_transition;
    	let current;

    	const block = {
    		c: function create() {
    			div = element("div");
    			slot0 = element("slot");
    			t = space();
    			slot1 = element("slot");
    			attr_dev(slot0, "class", "longdesc");
    			attr_dev(slot0, "name", "longdesc");
    			add_location(slot0, file$1, 120, 2, 3234);
    			attr_dev(slot1, "id", "cookies");
    			attr_dev(slot1, "name", "cookies");
    			add_location(slot1, file$1, 121, 2, 3283);
    			attr_dev(div, "class", "extra");
    			add_location(div, file$1, 119, 1, 3191);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, slot0);
    			append_dev(div, t);
    			append_dev(div, slot1);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fix(fade), {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fix(fade), {}, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(119:0) {#if showExtra}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div8;
    	let slot0;
    	let t0;
    	let div0;
    	let slot1;
    	let t1;
    	let t2;
    	let div7;
    	let div2;
    	let div1;

    	let t3_value = (/*showExtra*/ ctx[9]
    	? /*texttoggleless*/ ctx[4]
    	: /*texttogglemore*/ ctx[3]) + "";

    	let t3;
    	let t4;
    	let div3;
    	let t5;
    	let t6;
    	let div4;
    	let t7;
    	let t8;
    	let div5;
    	let t9;
    	let t10;
    	let div6;
    	let t11;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*showExtra*/ ctx[9] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div8 = element("div");
    			slot0 = element("slot");
    			t0 = space();
    			div0 = element("div");
    			slot1 = element("slot");
    			t1 = space();
    			if (if_block) if_block.c();
    			t2 = space();
    			div7 = element("div");
    			div2 = element("div");
    			div1 = element("div");
    			t3 = text(t3_value);
    			t4 = space();
    			div3 = element("div");
    			t5 = text(/*textchosen*/ ctx[5]);
    			t6 = space();
    			div4 = element("div");
    			t7 = text(/*textrequired*/ ctx[0]);
    			t8 = space();
    			div5 = element("div");
    			t9 = text(/*textdefault*/ ctx[1]);
    			t10 = space();
    			div6 = element("div");
    			t11 = text(/*textoptional*/ ctx[2]);
    			this.c = noop;
    			attr_dev(slot0, "name", "title");
    			add_location(slot0, file$1, 114, 1, 3066);
    			attr_dev(slot1, "class", "shortdesc");
    			attr_dev(slot1, "name", "shortdesc");
    			add_location(slot1, file$1, 116, 2, 3117);
    			attr_dev(div0, "class", "basic");
    			add_location(div0, file$1, 115, 1, 3094);
    			attr_dev(div1, "class", "button toggle");
    			add_location(div1, file$1, 126, 3, 3424);
    			attr_dev(div2, "class", "wrapstart");
    			toggle_class(div2, "hidden", !/*texttogglemore*/ ctx[3]);
    			add_location(div2, file$1, 125, 2, 3366);
    			attr_dev(div3, "class", "button chosen");
    			toggle_class(div3, "hidden", !/*showExtra*/ ctx[9]);
    			add_location(div3, file$1, 128, 2, 3532);
    			attr_dev(div4, "class", "button required");
    			toggle_class(div4, "hidden", /*showExtra*/ ctx[9] || !/*optionRequired*/ ctx[6]);
    			add_location(div4, file$1, 129, 2, 3642);
    			attr_dev(div5, "class", "button default");
    			toggle_class(div5, "hidden", /*showExtra*/ ctx[9] || !/*optionDefault*/ ctx[8]);
    			add_location(div5, file$1, 130, 2, 3775);
    			attr_dev(div6, "class", "button optional");
    			toggle_class(div6, "hidden", /*showExtra*/ ctx[9] || !/*optionOptional*/ ctx[7]);
    			add_location(div6, file$1, 131, 2, 3904);
    			attr_dev(div7, "class", "actionbar");
    			add_location(div7, file$1, 124, 1, 3340);
    			attr_dev(div8, "class", "wrap");
    			toggle_class(div8, "hidden", !/*shown*/ ctx[10]);
    			add_location(div8, file$1, 113, 0, 3024);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div8, anchor);
    			append_dev(div8, slot0);
    			append_dev(div8, t0);
    			append_dev(div8, div0);
    			append_dev(div0, slot1);
    			append_dev(div8, t1);
    			if (if_block) if_block.m(div8, null);
    			append_dev(div8, t2);
    			append_dev(div8, div7);
    			append_dev(div7, div2);
    			append_dev(div2, div1);
    			append_dev(div1, t3);
    			append_dev(div7, t4);
    			append_dev(div7, div3);
    			append_dev(div3, t5);
    			append_dev(div7, t6);
    			append_dev(div7, div4);
    			append_dev(div4, t7);
    			append_dev(div7, t8);
    			append_dev(div7, div5);
    			append_dev(div5, t9);
    			append_dev(div7, t10);
    			append_dev(div7, div6);
    			append_dev(div6, t11);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window, "skmcookie", /*handleCookie*/ ctx[12], false, false, false),
    					listen_dev(div1, "click", /*toggle*/ ctx[11], false, false, false),
    					listen_dev(div3, "click", /*click_handler*/ ctx[16], false, false, false),
    					listen_dev(div4, "click", /*click_handler_1*/ ctx[17], false, false, false),
    					listen_dev(div5, "click", /*click_handler_2*/ ctx[18], false, false, false),
    					listen_dev(div6, "click", /*click_handler_3*/ ctx[19], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*showExtra*/ ctx[9]) {
    				if (if_block) {
    					if (dirty & /*showExtra*/ 512) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div8, t2);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}

    			if ((!current || dirty & /*showExtra, texttoggleless, texttogglemore*/ 536) && t3_value !== (t3_value = (/*showExtra*/ ctx[9]
    			? /*texttoggleless*/ ctx[4]
    			: /*texttogglemore*/ ctx[3]) + "")) set_data_dev(t3, t3_value);

    			if (dirty & /*texttogglemore*/ 8) {
    				toggle_class(div2, "hidden", !/*texttogglemore*/ ctx[3]);
    			}

    			if (!current || dirty & /*textchosen*/ 32) set_data_dev(t5, /*textchosen*/ ctx[5]);

    			if (dirty & /*showExtra*/ 512) {
    				toggle_class(div3, "hidden", !/*showExtra*/ ctx[9]);
    			}

    			if (!current || dirty & /*textrequired*/ 1) set_data_dev(t7, /*textrequired*/ ctx[0]);

    			if (dirty & /*showExtra, optionRequired*/ 576) {
    				toggle_class(div4, "hidden", /*showExtra*/ ctx[9] || !/*optionRequired*/ ctx[6]);
    			}

    			if (!current || dirty & /*textdefault*/ 2) set_data_dev(t9, /*textdefault*/ ctx[1]);

    			if (dirty & /*showExtra, optionDefault*/ 768) {
    				toggle_class(div5, "hidden", /*showExtra*/ ctx[9] || !/*optionDefault*/ ctx[8]);
    			}

    			if (!current || dirty & /*textoptional*/ 4) set_data_dev(t11, /*textoptional*/ ctx[2]);

    			if (dirty & /*showExtra, optionOptional*/ 640) {
    				toggle_class(div6, "hidden", /*showExtra*/ ctx[9] || !/*optionOptional*/ ctx[7]);
    			}

    			if (dirty & /*shown*/ 1024) {
    				toggle_class(div8, "hidden", !/*shown*/ ctx[10]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div8);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("skm-consent", slots, []);
    	let { consentcookie = "skm-cookie" } = $$props;
    	let { textrequired = "Agree required" } = $$props;
    	let { textdefault = "Agree preferred" } = $$props;
    	let { textoptional = "Agree all" } = $$props;
    	let { texttogglemore = "" } = $$props;
    	let { texttoggleless = "Hide details" } = $$props;
    	let { textchosen = "Agree on chosen" } = $$props;
    	let { debug = false } = $$props;

    	// texts and types could be wrapped in object/arrays
    	// but then again it makes code somewhat not-easy-to-read
    	// and might have issues with Svelte's value-checking (or might not, don't want to test :D)
    	// so let's go with this ugly way (may differ in future)
    	// which options are available
    	// checked in mount ("constructor")
    	let optionRequired = false;

    	let optionOptional = false;
    	let optionDefault = false;

    	// toggle for showing the extra-info
    	let showExtra = false;

    	// Is the whole cookie consent show at all
    	let shown = false;

    	// the cookies within
    	// populated when cookies inform about themselves
    	const cookies = {};

    	function toggle() {
    		$$invalidate(9, showExtra = !showExtra);
    	}

    	function handleCookie(event) {
    		event.stopPropagation();

    		cookies[event.detail.cookie] = {
    			name: event.detail.cookie,
    			value: event.detail.val,
    			type: event.detail.type
    		};

    		checkState();
    	}

    	function consent(method) {
    		const agreed = [];

    		for (const cookieKey in cookies) {
    			const cookie = cookies[cookieKey];
    			if (method == "chosen" && cookie.value) agreed.push(cookie.name); else if (method == "required" && cookie.type == "required") agreed.push(cookie.name); else if (method == "default" && (cookie.type == "required" || cookie.type == "default")) agreed.push(cookie.name); else if (method == "optional") agreed.push(cookie.name);
    		}

    		setCookie(consentcookie, agreed.join("|"), 1);

    		let event = new CustomEvent("skmcookieconsent",
    		{
    				detail: { agreed, "allCookies": cookies },
    				bubbles: true,
    				composed: true
    			});

    		dispatchEvent(event);

    		if (debug) {
    			console.log("Consent got to:");
    			console.log(agreed);
    			console.log("Dispatched event:");
    			console.log(event);
    		}

    		$$invalidate(10, shown = false);
    	}

    	function checkState() {
    		for (const cookie in cookies) {
    			switch (cookies[cookie].type) {
    				case "required":
    					$$invalidate(6, optionRequired = true);
    					break;
    				case "default":
    					$$invalidate(8, optionDefault = true);
    					break;
    				case "optional":
    					$$invalidate(7, optionOptional = true);
    					break;
    			}
    		}
    	}

    	onMount(async () => {
    		await tick();
    		$$invalidate(10, shown = isBlank(getCookie(consentcookie)));

    		if (!shown && debug) {
    			console.log("Debug cookie-clear enabled, refresh page to see cookie-consent");
    			setCookie(consentcookie, "");
    		}
    	});

    	const writable_props = [
    		"consentcookie",
    		"textrequired",
    		"textdefault",
    		"textoptional",
    		"texttogglemore",
    		"texttoggleless",
    		"textchosen",
    		"debug"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<skm-consent> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => consent("chosen");
    	const click_handler_1 = () => consent("required");
    	const click_handler_2 = () => consent("default");
    	const click_handler_3 = () => consent("optional");

    	$$self.$$set = $$props => {
    		if ("consentcookie" in $$props) $$invalidate(14, consentcookie = $$props.consentcookie);
    		if ("textrequired" in $$props) $$invalidate(0, textrequired = $$props.textrequired);
    		if ("textdefault" in $$props) $$invalidate(1, textdefault = $$props.textdefault);
    		if ("textoptional" in $$props) $$invalidate(2, textoptional = $$props.textoptional);
    		if ("texttogglemore" in $$props) $$invalidate(3, texttogglemore = $$props.texttogglemore);
    		if ("texttoggleless" in $$props) $$invalidate(4, texttoggleless = $$props.texttoggleless);
    		if ("textchosen" in $$props) $$invalidate(5, textchosen = $$props.textchosen);
    		if ("debug" in $$props) $$invalidate(15, debug = $$props.debug);
    	};

    	$$self.$capture_state = () => ({
    		fade,
    		onMount,
    		tick,
    		fix,
    		setCookie,
    		getCookie,
    		isBlank,
    		consentcookie,
    		textrequired,
    		textdefault,
    		textoptional,
    		texttogglemore,
    		texttoggleless,
    		textchosen,
    		debug,
    		optionRequired,
    		optionOptional,
    		optionDefault,
    		showExtra,
    		shown,
    		cookies,
    		toggle,
    		handleCookie,
    		consent,
    		checkState
    	});

    	$$self.$inject_state = $$props => {
    		if ("consentcookie" in $$props) $$invalidate(14, consentcookie = $$props.consentcookie);
    		if ("textrequired" in $$props) $$invalidate(0, textrequired = $$props.textrequired);
    		if ("textdefault" in $$props) $$invalidate(1, textdefault = $$props.textdefault);
    		if ("textoptional" in $$props) $$invalidate(2, textoptional = $$props.textoptional);
    		if ("texttogglemore" in $$props) $$invalidate(3, texttogglemore = $$props.texttogglemore);
    		if ("texttoggleless" in $$props) $$invalidate(4, texttoggleless = $$props.texttoggleless);
    		if ("textchosen" in $$props) $$invalidate(5, textchosen = $$props.textchosen);
    		if ("debug" in $$props) $$invalidate(15, debug = $$props.debug);
    		if ("optionRequired" in $$props) $$invalidate(6, optionRequired = $$props.optionRequired);
    		if ("optionOptional" in $$props) $$invalidate(7, optionOptional = $$props.optionOptional);
    		if ("optionDefault" in $$props) $$invalidate(8, optionDefault = $$props.optionDefault);
    		if ("showExtra" in $$props) $$invalidate(9, showExtra = $$props.showExtra);
    		if ("shown" in $$props) $$invalidate(10, shown = $$props.shown);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		textrequired,
    		textdefault,
    		textoptional,
    		texttogglemore,
    		texttoggleless,
    		textchosen,
    		optionRequired,
    		optionOptional,
    		optionDefault,
    		showExtra,
    		shown,
    		toggle,
    		handleCookie,
    		consent,
    		consentcookie,
    		debug,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3
    	];
    }

    class Consent extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>*{box-sizing:border-box;font-family:var(--cookie-font, Verdana, sans-serif);font:var(--skm-font, 16px);color:var(--skm-color, black)}.actionbar{display:flex;align-items:flex-end;justify-content:flex-end;flex-wrap:wrap;margin-top:5px}.button{display:inline-block;padding:0.35em 1.2em;border:0.1em solid #FFFFFF;background-color:#000000;margin:0 0.3em 0.3em 0;border-radius:0.12em;box-sizing:border-box;text-decoration:none;font-weight:300;color:#FFFFFF;text-align:center;transition:all 0.2s}.button.toggle{align-self:flex-start}.button:hover{cursor:pointer;color:#000000;background-color:#FFFFFF}.wrapstart{flex-grow:1;justify-content:flex-start}@media all and (max-width:30em){.button{display:block;margin:0.4em auto}}.wrap{position:fixed;bottom:20px;display:block;left:50%;transform:translateX(-50%);width:var(--skm-consent-max-width, 800px);max-width:100%;padding:20px;max-height:calc(100% - 40px);overflow-y:auto;overflow-x:hidden;background:var(--skm-consent-bg, white);border:var(--skm-consent-border, 4px solid grey)}.hidden{display:none !important;flex-grow:0}</style>`;

    		init(
    			this,
    			{
    				target: this.shadowRoot,
    				props: attribute_to_object(this.attributes),
    				customElement: true
    			},
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				consentcookie: 14,
    				textrequired: 0,
    				textdefault: 1,
    				textoptional: 2,
    				texttogglemore: 3,
    				texttoggleless: 4,
    				textchosen: 5,
    				debug: 15
    			}
    		);

    		if (options) {
    			if (options.target) {
    				insert_dev(options.target, this, options.anchor);
    			}

    			if (options.props) {
    				this.$set(options.props);
    				flush();
    			}
    		}
    	}

    	static get observedAttributes() {
    		return [
    			"consentcookie",
    			"textrequired",
    			"textdefault",
    			"textoptional",
    			"texttogglemore",
    			"texttoggleless",
    			"textchosen",
    			"debug"
    		];
    	}

    	get consentcookie() {
    		return this.$$.ctx[14];
    	}

    	set consentcookie(consentcookie) {
    		this.$set({ consentcookie });
    		flush();
    	}

    	get textrequired() {
    		return this.$$.ctx[0];
    	}

    	set textrequired(textrequired) {
    		this.$set({ textrequired });
    		flush();
    	}

    	get textdefault() {
    		return this.$$.ctx[1];
    	}

    	set textdefault(textdefault) {
    		this.$set({ textdefault });
    		flush();
    	}

    	get textoptional() {
    		return this.$$.ctx[2];
    	}

    	set textoptional(textoptional) {
    		this.$set({ textoptional });
    		flush();
    	}

    	get texttogglemore() {
    		return this.$$.ctx[3];
    	}

    	set texttogglemore(texttogglemore) {
    		this.$set({ texttogglemore });
    		flush();
    	}

    	get texttoggleless() {
    		return this.$$.ctx[4];
    	}

    	set texttoggleless(texttoggleless) {
    		this.$set({ texttoggleless });
    		flush();
    	}

    	get textchosen() {
    		return this.$$.ctx[5];
    	}

    	set textchosen(textchosen) {
    		this.$set({ textchosen });
    		flush();
    	}

    	get debug() {
    		return this.$$.ctx[15];
    	}

    	set debug(debug) {
    		this.$set({ debug });
    		flush();
    	}
    }

    customElements.define("skm-consent", Consent);

    /* src\Cookie.svelte generated by Svelte v3.37.0 */

    const file = "src\\Cookie.svelte";

    function create_fragment(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let t0;
    	let div0_class_value;
    	let t1;
    	let label;
    	let input;
    	let input_disabled_value;
    	let t2;
    	let span;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			t0 = text(/*title*/ ctx[1]);
    			t1 = space();
    			label = element("label");
    			input = element("input");
    			t2 = space();
    			span = element("span");
    			this.c = noop;
    			attr_dev(div0, "class", div0_class_value = "title " + /*type*/ ctx[0]);
    			add_location(div0, file, 30, 8, 850);
    			attr_dev(input, "type", "checkbox");
    			input.disabled = input_disabled_value = /*type*/ ctx[0] == "required";
    			add_location(input, file, 32, 12, 933);
    			attr_dev(span, "class", "slider round");
    			add_location(span, file, 33, 12, 1028);
    			attr_dev(label, "class", "switch");
    			add_location(label, file, 31, 8, 898);
    			attr_dev(div1, "class", "option");
    			add_location(div1, file, 29, 4, 821);
    			attr_dev(div2, "class", "main");
    			add_location(div2, file, 28, 0, 783);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div2, anchor);
    			append_dev(div2, div1);
    			append_dev(div1, div0);
    			append_dev(div0, t0);
    			append_dev(div1, t1);
    			append_dev(div1, label);
    			append_dev(label, input);
    			input.checked = /*cookieChecked*/ ctx[2];
    			append_dev(label, t2);
    			append_dev(label, span);
    			/*div2_binding*/ ctx[6](div2);

    			if (!mounted) {
    				dispose = listen_dev(input, "change", /*input_change_handler*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*title*/ 2) set_data_dev(t0, /*title*/ ctx[1]);

    			if (dirty & /*type*/ 1 && div0_class_value !== (div0_class_value = "title " + /*type*/ ctx[0])) {
    				attr_dev(div0, "class", div0_class_value);
    			}

    			if (dirty & /*type*/ 1 && input_disabled_value !== (input_disabled_value = /*type*/ ctx[0] == "required")) {
    				prop_dev(input, "disabled", input_disabled_value);
    			}

    			if (dirty & /*cookieChecked*/ 4) {
    				input.checked = /*cookieChecked*/ ctx[2];
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			/*div2_binding*/ ctx[6](null);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("skm-cookie", slots, []);
    	let { title = "My cookie" } = $$props;
    	let { name = "anonymous" } = $$props;
    	let { type = "required" } = $$props;
    	const allowedTypes = ["required", "default", "optional"];
    	let el;
    	let cookieChecked = type != "optional";

    	function dispatchState(isChecked) {
    		$$invalidate(0, type = allowedTypes.includes(type) ? type : "optional");

    		let event = new CustomEvent("skmcookie",
    		{
    				detail: {
    					"cookie": name,
    					"val": cookieChecked,
    					type
    				},
    				bubbles: true,
    				composed: true, // needed for the event to traverse beyond shadow dom
    				
    			});

    		dispatchEvent(event);
    	}

    	const writable_props = ["title", "name", "type"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<skm-cookie> was created with unknown prop '${key}'`);
    	});

    	function input_change_handler() {
    		cookieChecked = this.checked;
    		$$invalidate(2, cookieChecked);
    	}

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			el = $$value;
    			$$invalidate(3, el);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("name" in $$props) $$invalidate(4, name = $$props.name);
    		if ("type" in $$props) $$invalidate(0, type = $$props.type);
    	};

    	$$self.$capture_state = () => ({
    		title,
    		name,
    		type,
    		allowedTypes,
    		el,
    		cookieChecked,
    		dispatchState
    	});

    	$$self.$inject_state = $$props => {
    		if ("title" in $$props) $$invalidate(1, title = $$props.title);
    		if ("name" in $$props) $$invalidate(4, name = $$props.name);
    		if ("type" in $$props) $$invalidate(0, type = $$props.type);
    		if ("el" in $$props) $$invalidate(3, el = $$props.el);
    		if ("cookieChecked" in $$props) $$invalidate(2, cookieChecked = $$props.cookieChecked);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*cookieChecked*/ 4) {
    			// bound on change
    			{
    				dispatchState();
    			}
    		}
    	};

    	return [type, title, cookieChecked, el, name, input_change_handler, div2_binding];
    }

    class Cookie extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>.main{box-sizing:border-box;margin-bottom:8px;font-family:var(--cookie-font, Verdana, sans-serif)}.option{display:flex}.option:hover{background-color:rgba(0,0,0,0.1)}.title{flex-grow:1;font:var(--skm-font, 15px/16px)}.title.required:after{color:var(--skm-cookie-checked-color, #2196F3);;;content:' *';display:inline}.switch{position:relative;display:inline-block;width:60px;min-width:60px;height:34px}.switch input{opacity:0;width:0;height:0}.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:var(--skm-cookie-unchecked-color, #ccc);-webkit-transition:.25s;transition:.25s}.slider:before{position:absolute;content:"";height:26px;width:26px;left:4px;bottom:4px;background-color:white;-webkit-transition:.25s;transition:.25s}input:checked+.slider{background-color:var(--skm-cookie-checked-color, #2196F3)}input:focus+.slider{box-shadow:0 0 1px #2196F3}input:checked+.slider:before{-webkit-transform:translateX(26px);-ms-transform:translateX(26px);transform:translateX(26px)}.slider.round{border-radius:34px}.slider.round:before{border-radius:50%}</style>`;

    		init(
    			this,
    			{
    				target: this.shadowRoot,
    				props: attribute_to_object(this.attributes),
    				customElement: true
    			},
    			instance,
    			create_fragment,
    			safe_not_equal,
    			{ title: 1, name: 4, type: 0 }
    		);

    		if (options) {
    			if (options.target) {
    				insert_dev(options.target, this, options.anchor);
    			}

    			if (options.props) {
    				this.$set(options.props);
    				flush();
    			}
    		}
    	}

    	static get observedAttributes() {
    		return ["title", "name", "type"];
    	}

    	get title() {
    		return this.$$.ctx[1];
    	}

    	set title(title) {
    		this.$set({ title });
    		flush();
    	}

    	get name() {
    		return this.$$.ctx[4];
    	}

    	set name(name) {
    		this.$set({ name });
    		flush();
    	}

    	get type() {
    		return this.$$.ctx[0];
    	}

    	set type(type) {
    		this.$set({ type });
    		flush();
    	}
    }

    customElements.define("skm-cookie", Cookie);

}());
//# sourceMappingURL=bundle.js.map
