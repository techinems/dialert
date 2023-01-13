# dialert

**DiALERT** checks a schedule and changes a PBX ring group accordingly. It was created for @rpiambulance for use by their duty supervisors.

## Setup

Setup of **DiALERT** is more in-depth than most other of TiEMS's offerings.

### Docker setup

First, configure Docker to run **DiALERT**. We use Docker Compose, so our `docker-compose.yml` looks something like:

```
version '3'

services:
  dialert:
    build: https://github.com/techinems/dialert.git#main
    container_name: dialert
    restart: always
    volumes:
      - /docker/dialert/sups.json:/usr/src/app/sups.json:ro
    env_file: dialert/env.env
```

Note that this isn't complete as we host a bunch of other things on this server, but the above config should work for a standalone **DiALERT** instance.

### Environment variables

Next, you need to set up the environment variables. This can be done right in the Docker Compose file or in an external file, like how we do it. You need the following, which are all included in `.env.example`.

| Variable                | Example                                           | Comments                                                                |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `FREEPBX_API_URL`       | https://pbx.example.com/admin/api/api/            |                                                                         |
| `FREEPBX_TOKEN_URL`     | https://pbx.example.com/admin/api/api/token       |                                                                         |
| `FREEPBX_AUTH_URL`      | https://pbx.example.com/admin/api/api/authorize   |                                                                         |
| `FREEPBX_GQL_URL`       | https://pbx.example.com/admin/api/api/gql         |                                                                         |
| `FREEPBX_CLIENT_ID`     | superlongclientidhere                             | Get from FreePBX API                                                    |
| `FREEPBX_CLIENT_SECRET` | superlongclientsecrethere                         | Get from FreePBX API                                                    |
| `FREEPBX_SCOPE`         | gql:ringgroups gql:framework                      | These two scopes are required                                           |
| `DS_RINGGROUP`          | 1101                                              |                                                                         |
| `BACKUP_DS_RINGGROUP`   | 1102                                              |                                                                         |
| `DS_CALLER_ID`          | <6175551234>                                      | Should be a DID you control in FreePBX/Asterisk                         |
| `NIGHT_CRON_STRING`     | 0 18 \* \* \*                                     |                                                                         |
| `DAY_CRON_STRING`       | 0 6 \* \* \*                                      |                                                                         |
| `DS_URL`                | https://ambulanceschedule.example.com/dialert.php |                                                                         |
| `DS_URL_TOKEN`          | securescheduletokenhere                           |                                                                         |
| `SUPERVISOR_INFO_FILE`  | sups.json                                         | This filepath is relative to the Docker container, not the host machine |
| `TZ`                    | America/New_York                                  |                                                                         |

Most of the above variables need to be set with values configured on or obtained from other servers (e.g. FreePBX, the scheduling server, etc.). Unless you make modifications to this application, `DS_URL`, in particular, must be configured to provide the user ID of a nighttime duty supervisor. Further, the application is currently written to query that URL with `?token=TOKENHERE` where `TOKENHERE` is set in `DS_URL_TOKEN`.

## Credits

### Name

**DiALERT**'s name is quadruply clever:

1. "di-" is a prefix meaning "two," "double," or similar. **DiALERT** runs _twice_ per day, integrates _two_ servers (the scheduling and the PBX servers), and manages _two_ ring groups (the normal and backup lists).
1. "Dial" stems from the use of telephone technology.
1. "Alert" comes from the ring groups' usage: to alert supervisors that someone needs them.
1. "ERT" is an abbreviation we use to mean "emergency response telephony."

I don't know—I thought of all that laying in bed one night. Do with it what you will.

### Developers

- [Dan Bruce](https://github.com/ddbruce)

### License

**DiALERT** is provided under the [MIT License](https://opensource.org/licenses/MIT).

### Contact

For any question, comments, or concerns, email [tech@techinems.org](mailto:tech@techinems.org), [create an issue](https://github.com/techinems/dialert/issues/new), or open up a pull request.
