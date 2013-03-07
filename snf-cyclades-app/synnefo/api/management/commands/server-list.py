# Copyright 2012 GRNET S.A. All rights reserved.
#
# Redistribution and use in source and binary forms, with or
# without modification, are permitted provided that the following
# conditions are met:
#
#   1. Redistributions of source code must retain the above
#      copyright notice, this list of conditions and the following
#      disclaimer.
#
#   2. Redistributions in binary form must reproduce the above
#      copyright notice, this list of conditions and the following
#      disclaimer in the documentation and/or other materials
#      provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY GRNET S.A. ``AS IS'' AND ANY EXPRESS
# OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
# PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL GRNET S.A OR
# CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
# SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
# LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF
# USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
# AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
# LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
# ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
# POSSIBILITY OF SUCH DAMAGE.
#
# The views and conclusions contained in the software and
# documentation are those of the authors and should not be
# interpreted as representing official policies, either expressed
# or implied, of GRNET S.A.

from optparse import make_option

from django.core.management.base import BaseCommand, CommandError
from synnefo.management.common import (format_vm_state, get_backend, Omit,
                                       filter_results, pprint_table, UserCache)
from synnefo.api.util import get_image
from synnefo.db.models import VirtualMachine

import logging
log = logging.getLogger(__name__)

FIELDS = VirtualMachine._meta.get_all_field_names()


class Command(BaseCommand):
    help = "List servers"

    option_list = BaseCommand.option_list + (
        make_option('-c',
            action='store_true',
            dest='csv',
            default=False,
            help="Use pipes to separate values"),
        make_option('--suspended',
            action='store_true',
            dest='suspended',
            default=False,
            help="List only suspended servers"),
        make_option('--build',
            action='store_true',
            dest='build',
            default=False,
            help="List only servers in the building state"),
        make_option('--deleted',
            action='store_true',
            dest='deleted',
            default=False,
            help="Include deleted servers"),
        make_option('--backend-id',
            dest='backend_id',
            help="List only servers of the specified backend"),
        make_option('--user',
            dest='user',
            help="List only servers of the specified user (uuid or email)"),
        make_option('--filter-by',
            dest='filter_by',
            help="Filter results. Comma seperated list of key `cond` val pairs"
                 " that displayed entries must satisfy. e.g."
                 " --filter-by \"operstate=STARTED,id>=22\"."
                 " Available keys are: %s" % ", ".join(FIELDS)),
        make_option('--displayname',
            action='store_true',
            dest='displayname',
            default=False,
            help="Display both uuid and display name"),
    )

    def handle(self, *args, **options):
        if args:
            raise CommandError("Command doesn't accept any arguments")

        ucache = UserCache()

        if options['backend_id']:
            backend = get_backend(options['backend_id'])
            servers = backend.virtual_machines
        else:
            servers = VirtualMachine.objects

        if options['deleted']:
            servers = servers.all()
        else:
            servers = servers.filter(deleted=False)

        if options['suspended']:
            servers = servers.filter(suspended=True)

        if options['build']:
            servers = servers.filter(operstate='BUILD')

        user = options['user']
        if user:
            if '@' in user:
                user = ucache.get_uuid(user)
            servers = servers.filter(userid=user)

        filter_by = options['filter_by']
        if filter_by:
            servers = filter_results(servers, filter_by)

        displayname = options['displayname']

        cache = ImageCache()

        headers = filter(lambda x: x is not Omit,
                         ['id',
                          'name',
                          'owner_uuid',
                          'owner_name' if displayname else Omit,
                          'flavor',
                          'image',
                          'state',
                          'backend',
                          ])

        uuids = list(set([server.userid for server in servers]))
        ucache.fetch_names(uuids)

        table = []
        for server in servers.order_by('id'):
            try:
                name = server.name.decode('utf8')
            except UnicodeEncodeError:
                name = server.name

            flavor = server.flavor.name

            image = cache.get_image(server.imageid, server.userid)

            state = format_vm_state(server)

            uuid = server.userid
            if displayname:
                dname = ucache.get_name(server.userid)

            fields = filter(lambda x: x is not Omit,
                            [str(server.id),
                             name,
                             uuid,
                             dname if displayname else Omit,
                             flavor,
                             image,
                             state,
                             str(server.backend),
                             ])
            table.append(fields)

        separator = " | " if options['csv'] else None
        pprint_table(self.stdout, table, headers, separator)


class ImageCache(object):
    def __init__(self):
        self.images = {}

    def get_image(self, imageid, userid):
        if not imageid in self.images:
            try:
                self.images[imageid] = get_image(imageid, userid)['name']
            except Exception as e:
                log.warning("Error getting image name from imageid %s: %s",
                            imageid, e)
                self.images[imageid] = imageid

        return self.images[imageid]
