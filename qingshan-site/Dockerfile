FROM node:24-bookworm-slim

WORKDIR /app
COPY --chown=node:node qingshan-site/server.mjs qingshan-site/rules.mjs qingshan-site/index.html qingshan-site/app.js qingshan-site/style.css qingshan-site/roster-image.js qingshan-site/character-cover.webp /app/qingshan-site/
COPY --chown=node:node qingshan-preview/qingshan-landscape.png /app/qingshan-preview/
RUN mkdir -p /app/qingshan-site/data && chown node:node /app/qingshan-site/data

USER node
ENV QINGSHAN_HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "/app/qingshan-site/server.mjs"]
