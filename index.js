// Copyright (c)2022 Quinn Michaels
const axios = require('axios');
const cheerio = require('cheerio');
const {XMLParser} = require('fast-xml-parser');

const package = require('./package.json');
const info = {
  id: package.id,
  name: package.name,
  version: package.version,
  author: package.author,
  describe: package.description,
  dir: __dirname,
  url: package.homepage,
  git: package.repository.url,
  bugs: package.bugs.url,
  license: package.license,
  copyright: package.copyright
};

const {agent,vars} = require('./data.json').DATA;
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
      return input.trim().replace(/[$|#|@]/g, '');
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
    /**************
    func: post
    params: opts
    describe: post data to a url
    ***************/
    post(opts) {
      return new Promise((resolve, reject) => {
        if (!opts.text) return reject('NO URL');
        axios.post(opts.text, opts.data).then(res => {
          console.log('POST RETURN ', res.data[0]);
          return resolve({
            text: 'POST DATA',
            html: 'POST DATA',
            data: res.data,
          });
        }).catch(reject)
      });
    },
    /**************
    func: get
    params: url
    describe: get a url response.
    ***************/
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
        let data, text;
        if (!url) return reject('NO URL');
        axios.get(url, {
          headers: this.vars.headers
        }).then(result => {
          try {
            const {channel} = this.modules.xmlparser.parse(result.data).rss;
            const buildrss = [
              `# ${channel.title}`,
              `p: ${channel.description}`,
              `published: ${channel.lastBuildDate}`,
              `link[${this.agent.translate(channel.title)}]:${channel.link}`,
              `copyright: ${channel.copyright}`,
              `\n-\n`,
            ];
            channel.item.forEach(itm => {
              let $desc = itm.description ? cheerio.load(itm.description, null, false) : false;
              $desc = $desc.text();
              const item = [
                `::begin:rssitem`,
                `## ${itm.title.replace(/\n/g, '')}`,
                $desc ? `p: ${this.lib.trimText($desc, 300)}` : '',
                itm.link ? `link[${this.agent.translate(itm.title)}]:${itm.link}` : '',
                !itm.link && itm.guid ? `link[${this.agent.translate(itm.title)}]:${itm.guid}` : '',
                itm.pubDate ? `date: ${itm.pubDate}` : '',
                `::end:rssitem`,
              ].join('\n\n');
              buildrss.push(item);
            });
            text = buildrss.join('\n\n');
            data = channel;
          } catch (e) {
            return this.error(e, url, reject);
          } finally {
            return this.question(`#feecting parse:${this.agent.key} ${text}`);
          }
        }).then(parsed => {
          return resolve({
            text:parsed.a.text,
            html:parsed.a.html,
            data
          });
        }).catch(err => {
          console.log('web error', err)
          return this.error(err);
        })
      });
    }
  },
  methods: {
    post(packet) {
      return this.func.post(packet.q);
    },
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
  onError(err) {
    console.error(err);
  },
  onInit(data) {
    this.modules.xmlparser = new XMLParser();
    return this.start(data);
  }
});
module.exports = WEB
