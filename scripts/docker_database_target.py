"""Resolve a Docker database alias in its client's network, never globally."""

def database_target(containers, client_name, hostname):
    named = {c['Name'].lstrip('/'): c for c in containers}
    client = named[client_name]
    shared = set(client['NetworkSettings']['Networks'])
    matches = []
    for candidate in containers:
        if not candidate['State']['Running']:
            continue
        name = candidate['Name'].lstrip('/')
        addresses = []
        for network, endpoint in candidate['NetworkSettings']['Networks'].items():
            if network in shared and endpoint.get('IPAddress') and (hostname == name or hostname in (endpoint.get('Aliases') or [])):
                addresses.append(endpoint['IPAddress'])
        if addresses:
            matches.append((name, sorted(set(addresses))))
    if len(matches) != 1:
        raise ValueError('Database alias is missing or ambiguous in the client network')
    return matches[0]
