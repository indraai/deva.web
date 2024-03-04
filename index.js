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
    get(url) {
      this.action('func', 'get');
      return new Promise((resolve, reject) => {
        if (!url) return reject('NO URL');
        axios.get(url, {
          headers: this.vars.headers
        }).then(result => {
          return resolve(this.utils.process(result.data));
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
      return this.func.post(packet.q);
    },
    get(packet) {
      return new Promise((resolve, reject) => {
        this.func.get(packet.q.text).then(result => {
          this.state('resolve', 'get');
          return resolve({
            text: true,
            html: true,
            data: true,
          })
        }).catch(err => {
          this.state('reject', 'get');
          return this.error(err, packet, reject);
        })
      });
    },
    json(packet) {
      return this.func.json(packet.q.text);
    },
    rss(packet) {
      return new Promise((resolve, reject) => {
        if (!packet) return resolve(this._messages.nopacket);
        if (!packet.q.text) return resolce(this._messages.notext);
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
  onError(err) {
    console.error(err);
  },
  onInit(data) {
    this.modules.xmlparser = new XMLParser();
    return this.start(data);
  }
});
module.exports = WEB
