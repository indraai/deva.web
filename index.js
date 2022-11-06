// Copyright (c)2022 Quinn Michaels
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const {XMLParser} = require('fast-xml-parser');

const data_path = path.join(__dirname, 'data.json');
const {agent,vars} = require(data_path).data;

const Deva = require('@indra.ai/deva');
const WEB = new Deva({
  agent: {
    uid: agent.uid,
    key: agent.key,
    name: agent.name,
    describe: agent.describe,
    prompt: agent.prompt,
    voice: agent.voice,
    profile: agent.profile,
    translate(input) {
      return input.trim();
    },
    parse(input) {
      input = input.replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/\'/g, '&#39;')
                .replace(/\`/g, '&#96;')
      return input.trim();
    }
  },
  vars,
  listeners: {},
  modules: {
    xmlparser: false,
  },
  deva: {},
  func: {
    get(url) {
      return new Promise((resolve, reject) => {
        if (!url) return reject('NO URL');
        axios.get(url, {
          headers: this.vars.headers
        }).then(result => {
          const rObject = typeof result.data === 'object' && result.data !== null ? true : false;
          const rArray = Array.isArray(result.data);

          let text, html, data = {};
          const htmldata = result.data.toLowerCase().includes('<body');
          if (htmldata) {
            const body = result.data;
            const _$ = cheerio.load(body, null, false);
            text = _$.text();
            html = _$.html();
            data = {};
          }
          else {
            text = result.data;
            html = `<pre><code>${this.agent.parse(result.data)}</code></pre>`;
          }

          return resolve({text,html,data});
        }).catch(err => {
          console.log('web error', err)
          return this.error(err);
        })
      });
    },

    /**************
    func: json
    params: url
    describe: return a json data url
    ***************/
    json(url) {
      return new Promise((resolve, reject) => {
        if (!url) return reject('NO URL');
        axios.get(url, {
          headers: this.vars.headers
        }).then(result => {
          try {
            text = JSON.stringify(result.data, null, 2);
            html = `<pre><code>${JSON.stringify(result.data, null, 2)}</code></pre>`;
            data = result.data;
          } catch (e) {
            return reject(e, opts, reject);
          } finally {
            return resolve({text,html,data});
          }
        }).catch(err => {
          console.log('web error', err)
          return this.error(err);
        })
      });
    },

    /**************
    func: rss
    params: url
    describe: Return a rss feed
    ***************/
    rss(url) {
      return new Promise((resolve, reject) => {
        if (!url) return reject('NO URL');
        axios.get(url, {
          headers: this.vars.headers
        }).then(result => {
          try {
            const data = this.modules.xmlparser.parse(result.data);
            const text = JSON.stringify(data, null, 2);
            const html = `<pre><code>${JSON.stringify(data, null, 2)}</code></pre>`;
          } catch (e) {
            return this.error(e, url, reject);
          } finally {
            return resolve({text,html,data});
          }
        }).catch(err => {
          console.log('web error', err)
          return this.error(err);
        })
      });
    }
  },
  methods: {
    get(packet) {
      return this.func.get(packet.q.text);
    },
    json(packet) {
      return this.func.json(packet.q.text);
    },
    rss(packet) {
      return this.func.rss(packet.q.text);
    },
    uid(packet) {
      return Promise.resolve(this.uid());
    },
    status(packet) {
      return this.status();
    },
    help(packet) {
      return new Promise((resolve, reject) => {
        this.lib.help(packet.q.text, __dirname).then(help => {
          return this.question(`#feecting parse ${help}`);
        }).then(parsed => {
          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data: parsed.a.data,
          });
        }).catch(reject);
      });
    },
  },
  onInit() {
    this.modules.xmlparser = new XMLParser();
    return this.start();
  }
});
module.exports = WEB
