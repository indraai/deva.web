// Copyright (c)2022 Quinn Michaels
import Deva from '@indra.ai/deva';

import axios from 'axios';
import cheerio from 'cheerio';
import {XMLParser} from 'fast-xml-parser';
import pkg from './package.json' with {type:'json'};
const {agent,vars} = pkg.data;

// set the __dirname
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';    
const __dirname = dirname(fileURLToPath(import.meta.url));

const info = {
  id: pkg.id,
  name: pkg.name,
  version: pkg.version,
  author: pkg.author,
  describe: pkg.description,
  dir: __dirname,
  url: pkg.homepage,
  git: pkg.repository.url,
  bugs: pkg.bugs.url,
  license: pkg.license,
  copyright: pkg.copyright
};

const WEB = new Deva({
  info,
  agent,
  vars,
  utils: {
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
    },
    process(input) {
      // input = input.replace(/<script>.*?<\/script>/gms, '')
      //              .replace(/<style(.+)?>.*?<\/style>/gms, '');
      // console.log('INPUT', input);
      return input;
    }
  },
  listeners: {},
  modules: {
    xmlparser: false,
  },
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
    get(url, id=false) {
      this.action('func', 'get');
      return new Promise((resolve, reject) => {
        if (!url) return reject(this.vars.messages.no_url);
        this.state('get', url);
        axios.get(url, {
          headers: this.vars.headers
        }).then(result => {
          this.state('return', `func:get:${id}`);
          return resolve(this.utils.process(result.data));
        }).catch(err => {
          this.state('catch', `func:get:${id}`);
          return this.error(err, url, reject);
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
      this.action('func', `rss:${url}`);
      const agent = this.agent();

      return new Promise((resolve, reject) => {
        let data, text;
        this.state('get', url);
        axios.get(url, {
          headers: this.vars.headers
        }).then(result => {
          try {
            const {channel} = this.modules.xmlparser.parse(result.data).rss;
            const buildrss = [
              `## ${channel.title}`,
              `describe: ${channel.description}`,
              `date: ${channel.lastBuildDate}`,
              `link[${this.utils.translate(channel.title)}]:${channel.link}`,
              `copyright: ${channel.copyright}`,
              `\n-\n`,
            ];
            channel.item.forEach((itm,idx) => {
              let $desc = itm.description ? cheerio.load(itm.description, null, false) : false;
              const item = [
                `::begin:rssitem`,
                `### ${itm.title.replace(/\n/g, '')}`,
                $desc ? `describe: ${this.trimWords($desc.text(), 75)}` : '',
                itm.pubDate ? `date: ${itm.pubDate}` : '',
                itm.link ? `button[Article Link]:${this.askChr}web get ${itm.link}` : '',
                !itm.link && itm.guid ? `button[Article Guid]:${this.askChr}web get ${itm.guid}` : '',
                `::end:rssitem`,
                '\n---\n',
              ].join('\n');
              if (idx < this.vars.rss.max_records) buildrss.push(item);
            });
            text = buildrss.join('\n');
            data = channel;
          } catch (e) {
            this.state('reject', url);
            return reject(e);
          } finally {
            this.state('resolve', url);
            return resolve({text,data});
          }
        }).catch(reject)
      });
    }
  },
  methods: {
    post(packet) {
      this.context('post', packet.id);
      this.action('method', `post:${packet.id}`);
      return this.func.post(packet.q);
    },
    get(packet) {
      this.context('get', packet.id);
      this.action('method', `get:${packet.id}`);
      return new Promise((resolve, reject) => {
        this.func.get(packet.q.text, packet.id).then(result => {
          this.state('resolve', `get:${packet.id}`);
          return resolve({
            text: result,
            html: result,
            data: false,
          })
        }).catch(err => {
          this.state('catch', `get:${packet.id}`);
          return this.error(err, packet, reject);
        })
      });
    },
    json(packet) {
      this.context('json', packet.id);
      this.action('method', `json:${packet.id}`);
      return this.func.json(packet.q.text);
    },
    rss(packet) {
      this.context('rss', packet.id);
      return new Promise((resolve, reject) => {
        if (!packet) return resolve(this._messages.nopacket);
        if (!packet.q.text) return resolve(this._messages.notext);
        if (packet.q.meta.params[1]) this.vars.rss.max_records = packet.q.meta.params[1];
        const data = {};

        this.func.rss(packet.q.text).then(feed => {
          data.feed = feed.data;
          this.state('parse', packet.q.text);
          return this.question(`${this.askChr}feecting parse ${feed.text}`);

        }).then(parsed => {
          data.feecting = parsed.a.data;
          this.state('resolve', packet.q.text);

          return resolve({
            text: parsed.a.text,
            html: parsed.a.html,
            data,
          });
        }).catch(err => {
          this.state('reject', packet.q.text);
          return this.error(err, packet, reject);
        })
      });
      return this.func.rss(packet.q);
    },
  },
  onError(err, reject) {
    console.error(err);
    return reject(err);
  },
  onReady(data, resolve) {
    this.modules.xmlparser = new XMLParser();
    this.prompt(this.vars.messages.ready);
    return resolve(data);
  }
});
export default WEB
