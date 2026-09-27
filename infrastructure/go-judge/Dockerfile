FROM criyle/go-judge:v1.12.3@sha256:6558c41279376868887f1e9e7db857df660449aff998aa2be799e910ad98a723

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 \
    && rm -rf /var/lib/apt/lists/*