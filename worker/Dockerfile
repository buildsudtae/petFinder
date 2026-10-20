ARG IMAGE_TAG=dev
FROM pettech-api:${IMAGE_TAG}
# build context is ../worker; the api image already carries app/ and the python deps
COPY . /srv/worker
WORKDIR /srv
CMD ["celery", "-A", "worker.celery_app.celery", "worker", "--beat", "--loglevel=info", "-Q", "pettech"]
