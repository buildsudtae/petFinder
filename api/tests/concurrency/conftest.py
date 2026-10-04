import pytest


# These tests run against the LIVE stack (BASE_URL, through Traefik). The parent
# conftest has autouse fixtures that create_all/TRUNCATE the database named by
# DATABASE_URL — inside the api container that is the real database. Override them
# with no-ops so this suite only ever talks HTTP and never touches tables directly.
@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def _clean():
    yield
